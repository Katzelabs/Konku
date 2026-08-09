package api

import (
	"net/http"

	"github.com/Katzelabs/Konku/internal/store"
	"github.com/Katzelabs/Konku/internal/store/gen"
)

// scoped runs one query inside a transaction scoped to the request's user.
//
// Every user-scoped read moved inside a transaction when RLS landed, because
// `SET LOCAL app.user_id` is transaction-scoped and a policy cannot read a
// setting that was never applied (D-059). Without a helper, each of the ~50
// call sites would grow a pre-declared variable and a four-line closure.
//
// It takes the user from the request context rather than as an argument, so
// there is exactly one place where "which user is this" is answered, and no
// call site can pass the wrong one. Handlers behind requireUser always have
// one; anywhere else this is a programming error and WithUserTx rejects the
// nil uuid rather than silently querying as nobody.
//
// The application's own `WHERE user_id = $n` stays in every query. This is the
// second mechanism, not a replacement for the first (hard rule 9).
func scoped[T any](s *Server, r *http.Request, fn func(*gen.Queries) (T, error)) (T, error) {
	user, _ := UserFrom(r.Context())
	return store.UserQuery(r.Context(), s.store, user.ID, fn)
}

// scopedExec is scoped for a query with no return value, and for the handful
// of handlers that need several statements to commit together.
func scopedExec(s *Server, r *http.Request, fn func(*gen.Queries) error) error {
	user, _ := UserFrom(r.Context())
	return s.store.WithUserTx(r.Context(), user.ID, fn)
}
