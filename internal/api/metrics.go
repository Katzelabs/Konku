package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/Katzelabs/Konku/internal/store"
)

// metrics answers two questions without anyone writing code first: what was
// slow in the last hour, and how close is the pool to its cap (D-062).
//
// The second is the one that matters. D-028 caps the pgx pool at 10 because
// Postgres is shared with other projects on the box, which makes pool
// exhaustion the most likely way this application falls over — and it fails as
// latency, not as errors, so nothing else would show it.
type metrics struct {
	registry  *prometheus.Registry
	requests  *prometheus.CounterVec
	durations *prometheus.HistogramVec
}

func newMetrics(st *store.Store) *metrics {
	// A private registry rather than prometheus.DefaultRegisterer: what
	// appears on /metrics is then exactly what is registered here, and a
	// dependency that registers a collector in its init() cannot quietly
	// change this endpoint's output.
	reg := prometheus.NewRegistry()

	m := &metrics{
		registry: reg,
		requests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "konku_http_requests_total",
			Help: "HTTP requests by routed pattern, method and status.",
		}, []string{"route", "method", "status"}),
		durations: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name: "konku_http_request_duration_seconds",
			Help: "HTTP request latency by routed pattern and method.",
			// Tuned for a local monolith: most requests are single-digit
			// milliseconds, so the default buckets would put almost
			// everything in the first one and make p50 meaningless.
			Buckets: []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10},
		}, []string{"route", "method"}),
	}

	reg.MustRegister(m.requests, m.durations)
	reg.MustRegister(collectors.NewGoCollector())
	reg.MustRegister(collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
	reg.MustRegister(newPoolCollector(st))

	return m
}

// middleware records every request. It labels by the *routed pattern*, never
// the raw path: `/api/notes/{id}` is one time series, while the raw path would
// mint a new one per note and turn the metrics endpoint into a slow memory
// leak. It also keeps resource UUIDs out of a surface that gets scraped and
// stored (rule 10).
func (m *metrics) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := wrapStatus(w)

		next.ServeHTTP(ww, r)

		route := "unmatched"
		if rc := chi.RouteContext(r.Context()); rc != nil {
			if p := rc.RoutePattern(); p != "" {
				route = p
			}
		}

		m.durations.WithLabelValues(route, r.Method).Observe(time.Since(start).Seconds())
		m.requests.WithLabelValues(route, r.Method, statusText(ww.status)).Inc()
	})
}

// handler serves the registry. It is mounted on its own listener bound to
// localhost (see cmd/konku), not on the application router: a separate socket
// cannot be exposed by a Caddy misconfiguration, and middleware that has to
// remember to exclude a path is one edit away from not excluding it.
func (m *metrics) handler() http.Handler {
	return promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{
		ErrorHandling: promhttp.ContinueOnError,
	})
}

// poolCollector reports pgx pool saturation, scraped on demand rather than
// sampled, so the numbers are the pool's own and cannot drift.
type poolCollector struct {
	st *store.Store

	acquired *prometheus.Desc
	idle     *prometheus.Desc
	total    *prometheus.Desc
	max      *prometheus.Desc
	waits    *prometheus.Desc
	waitSecs *prometheus.Desc
}

func newPoolCollector(st *store.Store) *poolCollector {
	return &poolCollector{
		st: st,
		acquired: prometheus.NewDesc("konku_pgx_pool_acquired_conns",
			"Connections currently checked out of the pool.", nil, nil),
		idle: prometheus.NewDesc("konku_pgx_pool_idle_conns",
			"Connections open and idle in the pool.", nil, nil),
		total: prometheus.NewDesc("konku_pgx_pool_total_conns",
			"Connections currently open.", nil, nil),
		max: prometheus.NewDesc("konku_pgx_pool_max_conns",
			"Pool cap. Saturation is acquired divided by this (D-028).", nil, nil),
		waits: prometheus.NewDesc("konku_pgx_pool_empty_acquires_total",
			"Acquires that had to wait because the pool was empty.", nil, nil),
		waitSecs: prometheus.NewDesc("konku_pgx_pool_empty_acquire_wait_seconds_total",
			"Cumulative time spent waiting on an empty pool.", nil, nil),
	}
}

func (c *poolCollector) Describe(ch chan<- *prometheus.Desc) {
	ch <- c.acquired
	ch <- c.idle
	ch <- c.total
	ch <- c.max
	ch <- c.waits
	ch <- c.waitSecs
}

func (c *poolCollector) Collect(ch chan<- prometheus.Metric) {
	s := c.st.Pool().Stat()
	g := func(d *prometheus.Desc, v float64) {
		ch <- prometheus.MustNewConstMetric(d, prometheus.GaugeValue, v)
	}
	cnt := func(d *prometheus.Desc, v float64) {
		ch <- prometheus.MustNewConstMetric(d, prometheus.CounterValue, v)
	}

	g(c.acquired, float64(s.AcquiredConns()))
	g(c.idle, float64(s.IdleConns()))
	g(c.total, float64(s.TotalConns()))
	g(c.max, float64(s.MaxConns()))
	// EmptyAcquireCount is the leading indicator: it climbs while latency is
	// still fine, which is the window in which raising the cap is a decision
	// rather than an incident.
	cnt(c.waits, float64(s.EmptyAcquireCount()))
	cnt(c.waitSecs, s.EmptyAcquireWaitTime().Seconds())
}

// statusWriter captures the status code. chi's WrapResponseWriter would do
// this, but the logging middleware already wraps once and wrapping a wrapper
// makes Flush and Hijack pass-through subtly conditional.
type statusWriter struct {
	http.ResponseWriter
	status int
}

func wrapStatus(w http.ResponseWriter) *statusWriter {
	return &statusWriter{ResponseWriter: w, status: http.StatusOK}
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

// statusText buckets by class as well as exact code, so an error-rate query is
// a label match rather than a regex over a hundred values.
func statusText(code int) string {
	switch {
	case code >= 500:
		return "5xx"
	case code >= 400:
		return "4xx"
	case code >= 300:
		return "3xx"
	default:
		return "2xx"
	}
}
