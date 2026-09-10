# EventHive Deployment Guide

## 1. Overview

EventHive is designed for flexible deployment across containerized environments (Docker Compose / Kubernetes) as well as traditional Linux VM / systemd hosting.

---

## 2. Deployment Architecture

```
[ Clients / Browsers ]
         │
         ▼
[ Reverse Proxy / Load Balancer (Nginx / Cloudflare) ]
         │
         ├───> [ EventHive Node.js Application (:5000) ]
         │               │
         │               └───> [ MongoDB Database (:27017) ]
         │
         ▼
[ Prometheus Scraper (:9090) ] <─── /metrics
         │
         ▼
[ Grafana Dashboard (:3000) ]
```

---

## 3. Option A: Containerized Deployment (Recommended)

### Prerequisites
- Docker Engine (v24.0+)
- Docker Compose (v2.20+)

### Steps
1. **Clone Repository**:
   ```bash
   git clone https://github.com/skit-devops-2026/devops-24ESKCS005.git
   cd devops-24ESKCS005
   ```

2. **Configure Environment**:
   ```bash
   cp .env.example .env
   # Customize PORT and MONGO_URI if necessary
   ```

3. **Launch Stack with Docker Compose**:
   ```bash
   docker compose up -d --build
   ```

4. **Verify Containers**:
   ```bash
   docker compose ps
   ```

5. **Access Points**:
   - Application Web UI: `http://localhost:5000`
   - Application Health: `http://localhost:5000/health`
   - Prometheus Metrics: `http://localhost:5000/metrics`
   - Prometheus UI: `http://localhost:9090`
   - Grafana Dashboard: `http://localhost:3000` (User: `admin`, Pass: `admin`)

---

## 4. Option B: Linux VM / Systemd Service Deployment

### Prerequisites
- Ubuntu 22.04 LTS / Debian 12
- Node.js 20 LTS & npm
- MongoDB Community Server (v6.0+)

### Steps
1. **Install Node.js & Dependencies**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs mongodb-org
   sudo systemctl start mongod
   sudo systemctl enable mongod
   ```

2. **Setup Application**:
   ```bash
   sudo mkdir -p /var/www/eventhive
   sudo chown -R $USER:$USER /var/www/eventhive
   git clone https://github.com/skit-devops-2026/devops-24ESKCS005.git /var/www/eventhive
   cd /var/www/eventhive
   npm ci --omit=dev
   ```

3. **Configure Systemd Service**:
   Create `/etc/systemd/system/eventhive.service`:
   ```ini
   [Unit]
   Description=EventHive Campus Management Service
   After=network.target mongod.service

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/var/www/eventhive
   ExecStart=/usr/bin/npm start
   Restart=on-failure
   Environment=NODE_ENV=production
   Environment=PORT=5000
   Environment=MONGO_URI=mongodb://127.0.0.1:27017/eventhive

   [Install]
   WantedBy=multi-user.target
   ```

4. **Start & Enable Service**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl start eventhive
   sudo systemctl enable eventhive
   ```

---

## 5. Live Application URL

- **Status**: Self-hosted container stack ready.
- **Production URL**: `<placeholder: https://eventhive-24eskcs005.college.edu or public cloud URL upon staging provision>`
  *(No external cloud subscription is attached to the course repository; live demonstration is conducted on localhost / staging host).*

---

## 6. Troubleshooting

| Issue | Cause | Resolution |
|---|---|---|
| Port 5000 already in use | Another process running on port 5000 | Modify `PORT=5001` in `.env` or stop conflicting process. |
| MongoDB connection failed | MongoDB service not running | Run `sudo systemctl status mongod` or `docker compose logs mongodb`. |
| `/metrics` returns 404 | Server not running latest version | Verify `git pull origin main` and restart application. |
| Container exits immediately | Node dependency issue | Run `docker compose logs app` to inspect stdout/stderr. |
