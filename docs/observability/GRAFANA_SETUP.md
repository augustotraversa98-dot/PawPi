# Grafana Cloud — PawPi observability setup

Everything here uses the **free tier** (Grafana Cloud Free: metrics, logs, traces,
alerting). Telemetry arrives via the single OTLP endpoint configured in Railway.

## Metric names to expect

OpenTelemetry HTTP auto-instrumentation, once OTLP → Grafana Cloud is flowing,
produces (Prometheus-style names after OTLP conversion):

- `http_server_request_duration_seconds_bucket` / `_count` / `_sum`
  labels: `http_route`, `http_request_method`, `http_response_status_code`, `service_name`
- Business counters (Phase 2, from `src/lib/metrics.js`):
  `pawpi_payment_attempt_total`, `pawpi_payment_failure_total`,
  `pawpi_auth_failure_total`, `pawpi_db_error_total`

> Exact names can vary slightly by OTel/collector version. Open **Explore →
> Prometheus**, type `http_server` and let autocomplete confirm the real names,
> then paste them into the alert rules below.

## Panel PromQL (build a dashboard or import dashboard.json)

Request rate (req/s) by route:
```
sum by (http_route) (rate(http_server_request_duration_seconds_count[5m]))
```

5xx error rate (%):
```
100 * sum(rate(http_server_request_duration_seconds_count{http_response_status_code=~"5.."}[5m]))
    / sum(rate(http_server_request_duration_seconds_count[5m]))
```

p95 latency (s):
```
histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_seconds_bucket[5m])))
```

Payment failure rate (%) — Phase 2:
```
100 * sum(rate(pawpi_payment_failure_total[15m]))
    / clamp_min(sum(rate(pawpi_payment_attempt_total[15m])), 1)
```

## Alert rules (Grafana Alerting → new rule, per item)

Create these under one folder "PawPi" so the notification policy below catches them.

1. **HighServerErrorRate** — severity `critical`
   Expr (threshold: fire when > 5% for 5m):
   ```
   100 * sum(rate(http_server_request_duration_seconds_count{http_response_status_code=~"5.."}[5m]))
       / clamp_min(sum(rate(http_server_request_duration_seconds_count[5m])), 1)  > 5
   ```
   Pending period: 5m. Summary annotation:
   `5xx error rate is {{ $values.A }}% on pawpi-web`

2. **HighLatencyP95** — severity `warning`
   Fire when p95 > 1.5s for 10m:
   ```
   histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_seconds_bucket[5m]))) > 1.5
   ```

3. **PaymentFailuresSpike** — severity `critical` (enable after Phase 2 counters ship)
   Fire when failure rate > 20% over 15m with at least some volume:
   ```
   100 * sum(rate(pawpi_payment_failure_total[15m]))
       / clamp_min(sum(rate(pawpi_payment_attempt_total[15m])), 1) > 20
   ```

4. **NoTraffic** — severity `warning` (dead service / deploy broke routing)
   Fire when request rate is 0 for 10m:
   ```
   sum(rate(http_server_request_duration_seconds_count[5m])) == 0
   ```

## Contact point (this is what wakes Claude)

Grafana Alerting → **Contact points → Add → Webhook**:
- URL: `https://pawpi-production.up.railway.app/api/internal/grafana-alert`
- HTTP Method: `POST`
- Authorization Header — Scheme: `Bearer`, Credentials: `<ALERT_WEBHOOK_SECRET>`
  (the value is in the setup doc / your Railway variables)

**Notification policy**: route the "PawPi" folder alerts to this webhook contact
point. Set a sane group interval (e.g. 5m) and repeat interval (e.g. 4h) so a
flapping alert doesn't open ten PRs.

## Test the wiring end to end

1. In the webhook contact point, click **Test** → the relay should return `200`
   and (if `GITHUB_DISPATCH_TOKEN` is set) trigger the `claude-autofix` workflow.
2. Or trigger the workflow manually: GitHub → Actions → "Claude autofix" →
   **Run workflow** (workflow_dispatch) with a test alert name.
