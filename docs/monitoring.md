# EventHive Monitoring Guide

## 1. Overview

EventHive implements real-time monitoring and observability utilizing:
- **Application Instrumentation**: Real-time Node.js `/metrics` and `/health` HTTP endpoints.
- **Prometheus**: Time-series metrics collection and scraping engine (`monitoring/prometheus.yml`).
- **Grafana**: Visual observability dashboard (`monitoring/grafana_dashboard.json`).

---

## 2. Metrics Exposed by EventHive

The `/metrics` endpoint exposes metrics formatted according to the Prometheus text-based exposition format:

| Metric Name | Type | Description |
|---|---|---|
| `http_requests_total` | Counter | Total number of HTTP requests, labelled by `method` and `status` |
| `http_request_duration_seconds_total` | Counter | Cumulative duration of handled HTTP requests in seconds |
| `nodejs_process_uptime_seconds` | Gauge | Application process uptime in seconds |
| `nodejs_process_resident_memory_bytes` | Gauge | Resident memory (RSS) consumed by the Node.js process |
| `nodejs_process_heap_used_bytes` | Gauge | Memory actively allocated on the V8 heap |
| `nodejs_process_heap_total_bytes` | Gauge | Total V8 heap memory reserved by Node.js |
| `nodejs_process_cpu_user_seconds_total` | Counter | Total user CPU time consumed |
| `nodejs_process_cpu_system_seconds_total` | Counter | Total system kernel CPU time consumed |
| `eventhive_db_connection_status` | Gauge | MongoDB connection state (`1` = Connected, `0` = Disconnected) |

---

## 3. Prometheus Setup & Verification

1. **Configuration File**:
   Located at `monitoring/prometheus.yml`. Scrapes `http://app:5000/metrics` every 5 seconds.

2. **Run Prometheus via Docker Compose**:
   ```bash
   docker compose up -d prometheus
   ```

3. **Verify Scrape Targets**:
   - Open browser at `http://localhost:9090/targets`
   - Verify `eventhive` target shows state **UP** (1/1 up).

4. **Example Prometheus Queries (PromQL)**:
   - Request rate per second:
     ```promql
     sum(rate(http_requests_total[1m])) by (status)
     ```
   - Average request duration:
     ```promql
     rate(http_request_duration_seconds_total[1m]) / rate(http_requests_total[1m])
     ```
   - Heap memory usage in MB:
     ```promql
     nodejs_process_heap_used_bytes / (1024 * 1024)
     ```

---

## 4. Grafana Dashboard Import Instructions

1. **Access Grafana**:
   Open `http://localhost:3000` in browser.
   - Default Username: `admin`
   - Default Password: `admin`

2. **Add Prometheus Data Source**:
   - Navigate to **Configuration -> Data Sources -> Add data source**.
   - Select **Prometheus**.
   - Set URL to: `http://prometheus:9090` (inside Docker network) or `http://localhost:9090`.
   - Click **Save & Test**.

3. **Import Dashboard**:
   - Navigate to **Dashboards -> New -> Import**.
   - Click **Upload JSON file** or paste the content of `monitoring/grafana_dashboard.json`.
   - Select the `Prometheus` data source.
   - Click **Import**.

---

## 5. Troubleshooting Monitoring Stack

| Symptom | Cause | Resolution |
|---|---|---|
| Target state **DOWN** in Prometheus | App container not reachable on network | Verify `app` service is running via `docker compose ps`. |
| Grafana shows "No Data" | Prometheus data source URL wrong | Ensure data source URL is set to `http://prometheus:9090` within Docker. |
| Memory metric spikes | High memory allocation during load | Inspect `nodejs_process_heap_used_bytes` vs `heapTotal`. |
