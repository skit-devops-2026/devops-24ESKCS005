# EventHive — Campus Event Management Portal

> **DevOps Semester Project — Milestone 1 (Phase 1: Repository Hygiene & Scaffolding)**
>
> **Course Repository:** `skit-devops-2026/devops-24ESKCS005`

---

## Author

| Roll No. | Name | GitHub username |
|---|---|---|
| 24ESKCS005 | Aashish Kumawat | Aashish39069 |

---

## About

**EventHive** is a full-stack campus event management and academic governance portal designed for higher-education institutions. The platform streamlines campus event proposals, multi-tier approvals across faculty mentors and Heads of Departments (HOD), student event discovery, and digital pass registration.

The system connects four key institutional roles:
- **Students**: Discover verified campus events, register individually or in teams, and track confirmed registration pass IDs.
- **Student Clubs / Coordinators**: Submit detailed event proposals across domains with budgets, venues, and descriptions.
- **Faculty Mentors**: Review, endorse, or request revisions for proposals within their domain portfolio.
- **Head of Department (HOD)**: Final governance authority to approve venues, allocate campus resources, and publish events live.

---

## Tech Stack

- **Frontend**: Responsive HTML5, CSS3, JavaScript dashboards statically served via Express
- **Backend**: Node.js, Express.js (v4.19.2)
- **Database**: MongoDB with Mongoose ODM (v8.3.1)
- **Security & Utilities**: `bcryptjs` (v2.4.3) for credential hashing, `cors` (v2.8.5), `dotenv` (v16.4.5)

---

## Repository Structure

```
devops-24ESKCS005/
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions CI workflow (M1 hygiene checks)
├── docs/                      # Documentation and architectural specs (scaffolding)
│   └── .gitkeep
├── k8s/                       # Kubernetes deployment manifests (scaffolding)
│   └── .gitkeep
├── monitoring/                # Prometheus & Grafana monitoring configs (scaffolding)
│   └── .gitkeep
├── models/                    # Mongoose data schemas
│   ├── Event.js               # Event schema with approval workflow states
│   ├── Registration.js        # Registration schema with pass IDs and team details
│   └── User.js                # User schema with roles and domain assignments
├── public/                    # Frontend static portals and pages
│   ├── login.html             # Unified login page
│   ├── register.html          # Registration page
│   └── pages/
│       ├── club/              # Club coordinator dashboard
│       ├── faculty/           # Faculty mentor review dashboard
│       ├── hod/               # HOD governance dashboard
│       └── student/           # Student discovery and registration dashboard
├── scripts/                   # Automation and verification scripts
│   └── hygiene.sh             # Repository hygiene validation script
├── .env.example               # Sample environment configuration template
├── .gitignore                 # Excluded dependencies, secrets, and build artifacts
├── Makefile                   # Standardized build and lifecycle targets
├── package.json               # Node.js dependencies and run scripts
├── package-lock.json          # Dependency lockfile
├── README.md                  # Project documentation and setup guide
└── server.js                  # Application server entrypoint and REST APIs
```

---

## REST API Reference

### Authentication (`/api/auth`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new user (`name`, `email`, `password`, `role`, `uniqueId`, `domain`, `year`) |
| `POST` | `/api/auth/login` | Authenticate user credentials and return profile session |

### Event Management (`/api/events`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/events/live` | Retrieve all approved live campus events |
| `POST` | `/api/events/propose` | Submit a new event proposal for mentor review |
| `GET` | `/api/events/club/all` | List all events proposed by clubs |
| `GET` | `/api/events/faculty/:domain` | List domain-specific events pending faculty review |
| `PATCH` | `/api/events/:id/faculty-status` | Update faculty approval status (`Approved` / `Rejected`) |
| `GET` | `/api/events/hod/proposals` | List faculty-approved proposals awaiting HOD action |
| `PATCH` | `/api/events/:id/hod-status` | HOD final decision & venue assignment; publishes live |

### Registrations (`/api/registrations`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/registrations/register` | Register for an event and generate a unique Pass ID |
| `GET` | `/api/registrations/student/:roll` | Lookup registration history by student roll number |
| `GET` | `/api/registrations/faculty/:domain` | View registrations filtered by category domain |
| `GET` | `/api/registrations/all` | List all event registrations across the campus |

---

## Running Locally

### 1. Prerequisites
- Node.js (v18+ or v20+)
- npm (v9+)
- MongoDB (local service or MongoDB Atlas instance)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/skit-devops-2026/devops-24ESKCS005.git
cd devops-24ESKCS005

# Install dependencies using Makefile or npm
make install
# (or: npm install)
```

### 3. Environment Configuration
Create a `.env` file in the root directory using the template provided in `.env.example`:
```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/eventhive
```
*(Do not commit your local `.env` file to Git)*

### 4. Start the Application
```bash
# Start server using Makefile or npm
make run
# (or: npm start)
```
The server will start on `http://localhost:5000` (or the configured `PORT`).

### 5. Default Seed Accounts (Local Development)

When launching with an empty database, the application automatically seeds the following test accounts for local verification:

| Role | Name | Email | Password | Domain / Notes |
|---|---|---|---|---|
| Faculty Mentor | Dr. Meenakshi | `nss.faculty@college.edu` | `nss@123` | NSS Domain Portfolio |
| Faculty Mentor | Coach Rakesh | `sports.faculty@college.edu` | `sports@123` | Sports Domain Portfolio |
| Faculty Mentor | Dr. A.K. Verma | `tech.faculty@college.edu` | `tech@123` | Tech Domain Portfolio |
| Faculty Mentor | Prof. Priya Sen | `cultural.faculty@college.edu` | `cultural@123` | Non-Tech Domain Portfolio |
| Faculty Mentor | Prof. Vikram Malhotra | `robotics.faculty@college.edu` | `robotics@123` | Robotics Domain Portfolio |
| Head of Department | Head of Department | `hod@college.edu` | `hod@123` | Governance & Approvals |

New Student and Club Coordinator accounts can be registered directly via `/register.html` and accessed from `/login.html`.

---

## Deployment

EventHive provides containerized deployment manifests (`Dockerfile`, `docker-compose.yml`) as well as traditional Linux systemd deployment configurations.

### Quick Start with Docker Compose
```bash
# Start full application, MongoDB, Prometheus, and Grafana stack
docker compose up -d --build

# View running containers
docker compose ps
```
Detailed instructions for cloud VMs and Linux services are provided in [docs/deployment.md](docs/deployment.md).

---

## Observability & Monitoring

EventHive exposes real-time application and system metrics compatible with Prometheus:

- **Health Endpoint**: `GET /health` (returns JSON status, uptime, timestamp, and database state)
- **Prometheus Metrics**: `GET /metrics` (returns standard Prometheus exposition format)
- **Prometheus Configuration**: Located at [`monitoring/prometheus.yml`](monitoring/prometheus.yml)
- **Grafana Dashboard**: Importable dashboard specification at [`monitoring/grafana_dashboard.json`](monitoring/grafana_dashboard.json)

For setup, PromQL queries, and Grafana dashboard import steps, see [docs/monitoring.md](docs/monitoring.md).

---

## Live URL

- **Deployment Status**: Containerized stack configured and verified.
- **Production URL**: Local stack hosted at `http://localhost:5000` (live cloud deployment requires active cloud account credentials during viva examination; no external cloud URL is fabricated).

---

## DevOps Milestones Status

- [x] **M1 (Repository Hygiene & Scaffolding)**: Completed and verified (`skit-devops-2026/devops-24ESKCS005`).
- [x] **M2 (Documentation Improvement)**: Completed via PR #1.
- [x] **M3 (Automated Testing & GitHub Actions CI)**: Completed via PR #2 & PR #3 (24 tests passing).
- [x] **M4 (Jenkins CI Pipeline)**: Completed via PR #4 (`Jenkinsfile`).
- [x] **M5 (Docker Containerization)**: Completed via PR #5 (`Dockerfile`, `docker-compose.yml`, `.dockerignore`).
- [x] **M6 (Deployment & Prometheus Monitoring)**: Completed via PR #6 (`monitoring/prometheus.yml`, `monitoring/grafana_dashboard.json`, `/metrics`, `docs/`).
