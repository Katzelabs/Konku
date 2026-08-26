// Package api wires HTTP routes to handlers.
//
// Handlers are plain http.HandlerFunc — chi is a router, not a framework, so
// nothing here depends on a custom context type (D-042).
package api

import (
	"io/fs"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/Katzelabs/Konku/internal/auth"
	"github.com/Katzelabs/Konku/internal/config"
	"github.com/Katzelabs/Konku/internal/i18n"
	"github.com/Katzelabs/Konku/internal/store"
)

// Server holds the dependencies handlers need. Dependency injection is a
// struct with fields and a constructor — no framework (D-045).
type Server struct {
	cfg     config.Config
	store   *store.Store
	auth    *auth.Service
	mailer  Mailer
	dist    fs.FS
	metrics *metrics

	// Per-address limiter for the unauthenticated mail-sending paths.
	//
	// It lives on the Server rather than in Routes because the key is the
	// address in the request body, which only the handler has read. Per-IP
	// limiting alone lets an attacker mailbomb one victim from many hosts, and
	// per-address alone lets one host enumerate many victims — so both, and
	// neither replaces the other (07 L3).
	signupAddrLimit *rateLimiter

	// Per-account write limiter (07 L8). Keyed by user id rather than IP: the
	// IP limiters guard the paths where there is no account yet, and behind a
	// phone network or an office NAT an IP is shared by strangers.
	writeLimit *rateLimiter

	// Two routes writeLimit does not adequately cover, each with its own
	// budget rather than a share of one. See limitPerUser in quota.go for why
	// a 300/minute write rate is the wrong bound for either.
	deleteAccountLimit  *rateLimiter
	exportLimit         *rateLimiter
	passwordChangeLimit *rateLimiter
}

func NewServer(cfg config.Config, st *store.Store, au *auth.Service, mailer Mailer, dist fs.FS) *Server {
	return &Server{
		cfg:     cfg,
		store:   st,
		auth:    au,
		mailer:  mailer,
		dist:    dist,
		metrics: newMetrics(st),
		// Three sends per address per hour. Generous for someone whose mail is
		// slow to arrive, useless as a mailbomb.
		signupAddrLimit:     newRateLimiter(3, time.Hour),
		writeLimit:          newRateLimiter(writesPerMinute(cfg), writeLimitWindow),
		deleteAccountLimit:  newRateLimiter(maxAccountDeletes, accountDeleteWindow),
		exportLimit:         newRateLimiter(maxExports, exportWindow),
		passwordChangeLimit: newRateLimiter(maxPasswordChanges, passwordChangeWindow),
	}
}

// MetricsHandler serves the Prometheus registry.
//
// The caller mounts it on its own listener bound to localhost rather than on
// the application router (D-062). Pool saturation and request latency are
// operational data, and the surest way to keep them off the public internet is
// for them never to be routable from it.
func (s *Server) MetricsHandler() http.Handler { return s.metrics.handler() }

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP) // trustworthy because Caddy sits in front
	// The reader's language (D-094, ticket 11 I2). Above the routes rather
	// than per-handler for the same reason enforceOrigin is, and above
	// recoverer on purpose: every response below this line can carry a
	// sentence somebody reads, and the 500 a panic produces is one of them.
	//
	// This is the Accept-Language half. requireUser layers the account's own
	// setting over it, which is the top of the order — but it can only run
	// where there is an account, and a signed-out reader gets a language too.
	r.Use(negotiateLocale)
	// Order matters: requestLogger is above Recoverer so a panic still
	// produces a request log line with its status, and both are above the
	// metrics middleware so a panicked request is counted as the 500 it is.
	r.Use(requestLogger)
	// Ours, not chi's: a panic has to become a Sentry event and the standard
	// error shape, not a stack trace on stdout (D-062).
	r.Use(recoverer)
	r.Use(s.metrics.middleware)
	r.Use(securityHeaders)
	// The CSRF control (D-060). Above the routes rather than per-handler, so
	// a new state-changing endpoint is covered the moment it is added rather
	// than when somebody remembers.
	r.Use(enforceOrigin)
	r.Use(middleware.Timeout(30 * time.Second))

	loginLimit := newRateLimiter(loginAttempts(s.cfg), loginLimitWindow)
	// Tighter than login and over a longer window: every request on these
	// routes can cause a message to be sent to somebody, and the per-address
	// limiter inside the handlers is the other half of that (07 L3).
	signupLimit := newRateLimiter(5, time.Hour)
	// Verification is limited separately and far more loosely, because it is
	// the one route here that sends nothing. Guessing a token is not a threat
	// a rate limit addresses — it is 256 bits of CSPRNG — so the only job of
	// this limiter is hygiene, and a tight one would punish a shared IP where
	// several people verify from the same office or household.
	verifyLimit := newRateLimiter(30, time.Hour)
	// Crash reports (F-03). The budget and the reasoning are in clienterror.go,
	// beside the caps that bound the same endpoint's body.
	clientErrorLimit := newRateLimiter(maxClientErrorsPerHour, clientErrorWindow)

	// Operational endpoints, deliberately outside /api: they are not part of
	// the product's API surface and nothing in the SPA calls them. Splitting
	// liveness from readiness is D-062 — see health.go for why conflating them
	// makes a database blip look like a dead container.
	r.Get("/healthz", s.handleLive)
	r.Get("/readyz", s.handleReady)

	r.Route("/api", func(r chi.Router) {

		// Unauthenticated write paths, all rate-limited by IP. Signup and
		// resend are limited by address as well, inside their handlers (D-039,
		// 07 L3).
		r.With(loginLimit.middleware).Post("/auth/login", s.handleLogin)
		r.Post("/auth/logout", s.handleLogout)

		// What the login screen needs before anyone has signed in.
		r.Get("/auth/config", s.handleAuthConfig)

		// A crash in the browser, reported to the origin that served it (F-03).
		//
		// Unauthenticated with the rest of this group, because the screen a
		// crash strands somebody on most expensively is the login screen, and a
		// reporter that only works once you are signed in would be silent for
		// exactly that case. See clienterror.go for what keeps an open endpoint
		// safe to leave here.
		//
		// Limited per IP like every other unauthenticated write path, and
		// loosely: the browser already caps itself per page load, so this is the
		// bound on a client that ignores its own cap rather than on a person
		// whose session went wrong twice.
		r.With(clientErrorLimit.middleware).Post("/client-error", s.handleClientError)

		// Signup is behind the flag; verify and resend are not.
		//
		// Closing signup must not strand an account created while it was open
		// whose owner still has a live link in their mailbox — and resend is
		// the only way back for one whose first mail never arrived. Neither
		// creates an account, and both answer 204 for an address that does not
		// have a pending verification, so leaving them mounted gives away
		// nothing.
		if s.cfg.AllowSignup {
			r.With(signupLimit.middleware).Post("/auth/signup", s.handleSignup)
		}
		r.With(verifyLimit.middleware).Post("/auth/verify", s.handleVerify)
		r.With(signupLimit.middleware).Post("/auth/resend-verification", s.handleResendVerification)

		// Reset is mounted regardless of ALLOW_SIGNUP. Recovery is not a
		// registration feature: a closed instance still has accounts, and
		// they still have people who forget passwords. /auth/forgot sends
		// mail so it takes the signup limiter; /auth/reset sends none and
		// takes the looser one, for the same reason verify does (07 L4).
		r.With(signupLimit.middleware).Post("/auth/forgot", s.handleForgotPassword)
		r.With(verifyLimit.middleware).Post("/auth/reset", s.handleResetPassword)

		// Everything else requires a user. Keeping authenticated routes inside
		// an explicit group is why chi was chosen over stdlib: "all of /api
		// except login" is a security boundary, not a style preference.
		r.Group(func(r chi.Router) {
			r.Use(s.requireUser)

			r.Get("/auth/me", s.handleMe)

			// A deliberately panicking route, dev only, so the panic path can
			// be exercised end to end: recoverer, the standard error shape,
			// the request id, and the Sentry event (06 P3). Registered inside
			// requireUser so the event carries a user id, and behind the Dev
			// flag so it cannot exist in production.
			if s.cfg.Dev {
				r.Get("/__panic", func(http.ResponseWriter, *http.Request) {
					panic("deliberate panic from /api/__panic")
				})
			}

			// Everything that touches stored content also requires a verified
			// address (07 L3). /auth/me and /auth/logout stay above this line
			// on purpose: they report the caller's own authentication state,
			// which is what the client needs to render "check your mail" and
			// to sign out of it.
			//
			// A group rather than a check in each handler, for the same reason
			// requireUser is a group: "all of /api except these" is a security
			// boundary, and one that a new route joins by default.
			r.Group(func(r chi.Router) {
				// Suspension is checked before verification, because it is the
				// more important fact about an account that is both: telling
				// somebody to check their mail for a link that will not help
				// is worse than saying nothing (ticket 10, O1).
				//
				// In this group rather than merged into requireUser for the
				// same reason requireVerified is: /auth/me and /auth/logout
				// stay reachable, so a client holding a session that was live
				// when the account was suspended can still read its own state
				// and sign out of it.
				r.Use(s.requireNotSuspended)
				r.Use(s.requireVerified)
				// Above the routes rather than per-handler, so a new write
				// endpoint is covered the moment it is added rather than when
				// somebody remembers — the same reasoning as enforceOrigin.
				r.Use(s.limitWrites)

				// Deleting is soft on both resources, so both carry a restore and
				// both lists take ?deleted=true for the Terhapus view. The bulk
				// pair serves the selection bar; a static segment cannot collide
				// with {id}, which chi resolves ahead of the wildcard anyway.
				r.Route("/notes", func(r chi.Router) {
					r.Get("/", s.handleListNotes)
					r.Post("/", s.handleCreateNote)
					r.Post("/bulk-delete", s.handleDeleteNotes)
					r.Post("/bulk-restore", s.handleRestoreNotes)
					r.Get("/{id}", s.handleGetNote)
					r.Patch("/{id}", s.handleUpdateNote)
					r.Delete("/{id}", s.handleDeleteNote)
					r.Post("/{id}/restore", s.handleRestoreNote)
				})

				// Cards are their own resource with their own CRUD (D-055). This
				// list also serves the picker for a fixed exam's questions —
				// filters make one endpoint enough for both.
				r.Route("/cards", func(r chi.Router) {
					r.Get("/", s.handleListCards)
					r.Post("/", s.handleCreateCard)
					r.Post("/bulk-delete", s.handleDeleteCards)
					r.Post("/bulk-restore", s.handleRestoreCards)
					r.Get("/{id}", s.handleGetCard)
					r.Patch("/{id}", s.handleUpdateCard)
					r.Delete("/{id}", s.handleDeleteCard)
					r.Post("/{id}/restore", s.handleRestoreCard)
				})

				// One shared vocabulary across notes and cards. Deletion only
				// succeeds for a category nothing references; archiving is the
				// normal path (D-051).
				r.Route("/categories", func(r chi.Router) {
					r.Get("/", s.handleListCategories)
					r.Post("/", s.handleCreateCategory)
					r.Patch("/{id}", s.handleUpdateCategory)
					r.Delete("/{id}", s.handleDeleteCategory)
					r.Post("/{id}/archive", s.handleArchiveCategory)
					r.Post("/{id}/unarchive", s.handleUnarchiveCategory)
				})

				// Ulangan is one feature with two ways in (D-075).
				//
				// /due is the scheduled queue: no configuration, capped, and
				// the only path that moves card_schedules. /sets are saved
				// configurations; /runs are sittings of one, addressed on
				// their own once started rather than nested under the set.
				//
				// A card is addressed by its own uuid. It used to take a note
				// and an ID together, because card IDs were unique only within
				// the note they were parsed out of (D-055).
				r.Route("/review", func(r chi.Router) {
					r.Route("/due", func(r chi.Router) {
						r.Get("/", s.handleDueCards)
						r.Get("/{cardID}/answer", s.handleCardAnswer)
						r.Post("/{cardID}", s.handleRate)
					})

					r.Route("/sets", func(r chi.Router) {
						r.Get("/", s.handleListReviewSets)
						r.Post("/", s.handleCreateReviewSet)
						r.Get("/{id}", s.handleGetReviewSet)
						r.Patch("/{id}", s.handleUpdateReviewSet)
						r.Delete("/{id}", s.handleDeleteReviewSet)
						r.Post("/{id}/archive", s.handleArchiveReviewSet)
						r.Post("/{id}/unarchive", s.handleUnarchiveReviewSet)
						r.Put("/{id}/cards", s.handleSetReviewSetCards)
						r.Get("/{id}/runs", s.handleListSetRuns)
						r.Post("/{id}/runs", s.handleStartRun)
					})

					r.Route("/runs/{runID}", func(r chi.Router) {
						r.Get("/", s.handleGetRun)
						r.Delete("/", s.handleDeleteRun)
						r.Post("/finish", s.handleFinishRun)
						r.Get("/{cardID}/answer", s.handleRunAnswer)
						r.Post("/{cardID}", s.handleAnswerQuestion)
					})
				})

				r.Get("/sessions", s.handleListSessions)
				r.Post("/sessions", s.handleCreateSession)

				// Per-account preferences (user_settings, migration 00007).
				// Not the theme — that is per-device and stays in
				// localStorage. Singular and unaddressed, because there is
				// exactly one row per account and the caller is the key.
				r.Get("/settings", s.handleGetSettings)
				r.Patch("/settings", s.handleUpdateSettings)

				// Everything the account owns, as one archive (07 L6). GET
				// rather than POST: it creates nothing and a link the browser
				// can follow is the whole interaction.
				//
				// Being a GET is also why it needs its own limiter: limitWrites
				// waves reads through, and this read holds an open transaction
				// and the whole account in memory while it runs.
				r.With(s.limitPerUser(s.exportLimit, quotaExport,
					func(c *i18n.Catalog) string { return c.Account.TooManyExports },
				)).Get("/export", s.handleExport)

				// Irreversible, and the only endpoint that re-authenticates
				// (07 L7). Inside requireVerified with everything else: an
				// unverified account has nothing to delete but its own row,
				// and letting it through would be a second deletion path to
				// keep correct.
				//
				// Taking a password is what makes the tight limiter necessary
				// rather than merely tidy: without one, the write rate is the
				// only bound on guessing it.
				r.With(s.limitPerUser(s.deleteAccountLimit, quotaAccountDelete,
					func(c *i18n.Catalog) string { return c.Account.TooManyDeleteAttempts },
				)).Delete("/account", s.handleDeleteAccount)

				// Changing the password from inside the app, rather than
				// through the forgot-password mail — which was the only route
				// to a new password and is impossible on an instance with no
				// SMTP configured. Takes the current password, so it needs a
				// tighter bound on guessing than the write rate, exactly like
				// DELETE /account.
				r.With(s.limitPerUser(s.passwordChangeLimit, quotaPasswordChange,
					func(c *i18n.Catalog) string { return c.Account.TooManyPasswordChanges },
				)).Post("/auth/password", s.handleChangePassword)

				// Logins, not study time. Under /auth because /sessions has
				// meant the focus timer's since 03, and "sessions" genuinely
				// names two unrelated things here (07 L5, D-052).
				r.Route("/auth/sessions", func(r chi.Router) {
					r.Get("/", s.handleListAuthSessions)
					r.Delete("/", s.handleRevokeOtherAuthSessions)
					r.Delete("/{id}", s.handleRevokeAuthSession)
				})

				// Domains are per-user and editable (D-046). Deletion only
				// succeeds for a domain nothing references; archiving is the
				// normal path (D-051).
				r.Route("/domains", func(r chi.Router) {
					r.Get("/", s.handleListDomains)
					r.Post("/", s.handleCreateDomain)
					r.Patch("/{id}", s.handleUpdateDomain)
					r.Delete("/{id}", s.handleDeleteDomain)
					r.Post("/{id}/archive", s.handleArchiveDomain)
					r.Post("/{id}/unarchive", s.handleUnarchiveDomain)
				})
			})
		})

		// Unknown /api paths must return JSON, never the HTML shell.
		r.NotFound(func(w http.ResponseWriter, r *http.Request) {
			writeNotFound(w, r)
		})
	})

	// Everything that is not /api is the single-page app.
	r.NotFound(spaHandler(s.dist))

	return r
}
