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

	"github.com/zidanhafiz/konku/internal/api"
	"github.com/zidanhafiz/konku/internal/config"
	"github.com/zidanhafiz/konku/internal/web"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	if len(os.Args) > 1 && os.Args[1] == "seed-user" {
		if err := seedUser(os.Args[2:]); err != nil {
			slog.Error("seed-user failed", "error", err)
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

	// TODO(MVP): open the pgx pool with SetMaxOpenConns(10) — Go defaults to
	// unlimited and one app can starve every project on the shared Postgres
	// (D-028). Then run goose migrations from the embedded migrations/ dir.

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           api.NewServer(cfg, web.FS()).Routes(),
		ReadHeaderTimeout: 10 * time.Second,
	}

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
		if err := srv.Shutdown(ctx); err != nil {
			slog.Error("graceful shutdown failed", "error", err)
		}
	}()

	slog.Info("listening", "port", cfg.Port, "dev", cfg.Dev)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}

	<-shutdownDone
	return nil
}
