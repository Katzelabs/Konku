// Command konku is the Konku server.
//
// It serves the JSON API and the embedded React app from a single binary on a
// single origin (D-040), and runs database migrations at startup so a deploy
// is just "run the binary".
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Katzelabs/Konku/internal/api"
	"github.com/Katzelabs/Konku/internal/auth"
	"github.com/Katzelabs/Konku/internal/config"
	"github.com/Katzelabs/Konku/internal/mail"
	"github.com/Katzelabs/Konku/internal/store"
	"github.com/Katzelabs/Konku/internal/web"
)

// version is stamped at build time with -ldflags "-X main.version=...".
//
// "dev" for anything built locally. It answers "what is actually running"
// without shelling into the container, and it tags every Sentry event so a
// regression points at a release rather than at a date (D-061, D-062).
var version = "dev"

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	if len(os.Args) > 1 && os.Args[1] == "seed-user" {
		if err := seedUser(os.Args[2:]); err != nil {
			slog.Error("seed-user failed", "error", err)
			os.Exit(1)
		}
		return
	}

	// Stopping an account, and putting it back (ticket 10, O1). A subcommand
	// rather than an admin endpoint: there is no admin role in this product
	// and adding one to suspend an account would be a larger, more dangerous
	// surface than the problem needs. See suspend_user.go.
	if len(os.Args) > 1 && os.Args[1] == "suspend-user" {
		if err := suspendUser(os.Args[2:]); err != nil {
			slog.Error("suspend-user failed", "error", err)
			os.Exit(1)
		}
		return
	}

	// Demo content for one account: screenshots, design work, and showing the
	// thing to somebody. It guards itself against a non-dev config and against
	// an account that already has content — see seed_demo.go.
	if len(os.Args) > 1 && os.Args[1] == "seed-demo" {
		if err := seedDemo(os.Args[2:]); err != nil {
			slog.Error("seed-demo failed", "error", err)
			os.Exit(1)
		}
		return
	}

	if err := run(); err != nil {
		slog.Error("server failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	// Unset rather than defaulted in config, so the build stamp wins and a
	// deliberate SENTRY_RELEASE still overrides it.
	if cfg.SentryRelease == "" {
		cfg.SentryRelease = version
	}

	ctx := context.Background()

	st, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer st.Close()

	// Fatal on purpose: serving against a half-migrated schema produces errors
	// that look like application bugs.
	if err := st.Migrate(ctx, cfg.MigrationDatabaseURL); err != nil {
		return err
	}

	// Before the server starts, so a panic during startup is still reported.
	if err := api.InitSentry(cfg); err != nil {
		return err
	}
	defer api.FlushSentry()

	// Mail is optional at startup and required for signup: config refuses to
	// load with ALLOW_SIGNUP=true and no SMTP_URL, so a nil mailer here means
	// signup is closed and the route is never mounted (07 L2, L3).
	var mailer api.Mailer
	if cfg.SMTPURL != "" {
		sender, err := mail.New(cfg.SMTPURL, cfg.MailFrom, cfg.PublicBaseURL)
		if err != nil {
			return err
		}
		mailer = sender
	}

	app := api.NewServer(cfg, st, auth.NewService(st, cfg.SessionTTL), mailer, web.FS())

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           app.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// /metrics gets its own listener, bound to loopback (D-062). Failing to
	// bind it must not stop the application from serving: metrics are how you
	// find out something is wrong, not something the product needs to work.
	var metricsSrv *http.Server
	if cfg.MetricsAddr != "" {
		metricsSrv = &http.Server{
			Addr:              cfg.MetricsAddr,
			Handler:           app.MetricsHandler(),
			ReadHeaderTimeout: 10 * time.Second,
		}
		go func() {
			slog.Info("metrics listening", "addr", cfg.MetricsAddr)
			if err := metricsSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				slog.Error("metrics listener failed", "error", err)
			}
		}()
	}

	// Emptying Terhapus, daily.
	//
	// In the process rather than in a cron on the box, deliberately: a cron is
	// a second thing to install and a second thing to notice has stopped, and
	// the failure mode of forgetting it is the unbounded growth this job
	// exists to prevent. It needs no coordination — one container, and a
	// second one purging the same rows would find nothing to do.
	//
	// The first run is delayed rather than fired at boot, so a crash loop
	// cannot turn into a delete loop.
	purgeStop := make(chan struct{})
	go runPurge(st, purgeStop)

	// Shut down cleanly so in-flight requests finish and, later, the pgx pool
	// closes rather than leaking connections on the shared instance.
	shutdownDone := make(chan struct{})
	go func() {
		defer close(shutdownDone)

		stop := make(chan os.Signal, 1)
		signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
		<-stop

		slog.Info("shutting down")
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if metricsSrv != nil {
			// Closed first and without waiting: a scrape in flight is not
			// worth delaying the shutdown of the thing serving users.
			_ = metricsSrv.Close()
		}
		close(purgeStop)
		if err := srv.Shutdown(ctx); err != nil {
			slog.Error("graceful shutdown failed", "error", err)
		}
	}()

	slog.Info("listening", "port", cfg.Port, "dev", cfg.Dev, "version", version)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}

	<-shutdownDone
	return nil
}

// purgeInterval is how often Terhapus is emptied of anything past the window.
//
// Daily. The window is 30 days, so the exact hour a row leaves is not
// meaningful, and a sweep that runs more often would only mean more
// transactions for the same result.
const purgeInterval = 24 * time.Hour

// purgeStartupDelay keeps the first sweep away from boot.
//
// A destructive job that runs the instant the process starts turns a crash
// loop into a delete loop, and gives an operator watching a bad deploy no
// window to stop the container before it acts.
const purgeStartupDelay = 5 * time.Minute

// runPurge empties Terhapus on a timer until the process shuts down.
//
// Failures are logged and the loop continues: a purge that could not run today
// is not a reason to stop trying tomorrow, and it is emphatically not a reason
// to take the service down.
func runPurge(st *store.Store, stop <-chan struct{}) {
	timer := time.NewTimer(purgeStartupDelay)
	defer timer.Stop()

	for {
		select {
		case <-stop:
			return
		case <-timer.C:
		}
		timer.Reset(purgeInterval)

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		result, err := st.PurgeTrash(ctx, store.TrashWindow)
		cancel()

		if err != nil {
			slog.Error("purging deleted notes and cards failed",
				"notes", result.Notes, "cards", result.Cards, "error", err)
			continue
		}
		// Logged even when it removed nothing, so "the job is running" is
		// answerable without a metric. Counts only — no titles, no ids beyond
		// the account count (rule 10).
		slog.Info("purged deleted notes and cards",
			"notes", result.Notes, "cards", result.Cards, "accounts", result.Accounts)
	}
}
