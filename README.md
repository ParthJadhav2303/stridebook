# StrideBook

Fee tracking for the athletics club. Coaches and the head coach see, month by month,
which students have paid, and record Cash/UPI payments from their phones.

| Part | Tech | Folder |
|---|---|---|
| App (installable PWA) | React, Vite, TypeScript, Tailwind | `frontend/` |
| API | Python, FastAPI, SQLAlchemy, Alembic | `backend/` |
| Database | PostgreSQL 16 | Docker volume on the VM |
| Web server / HTTPS | Caddy (serves the app, proxies `/api`) | `deploy/caddy/` |
| Backups | nightly `pg_dump` → Azure Blob | `deploy/backup/` |
| Azure setup | Azure CLI + cloud-init | `infra/` |

Everything runs on one small Azure VM via `compose.yml`.

- Setup, deploy, backups, local dev: **[docs/runbook.md](docs/runbook.md)**
- Club name: set `CLUB_NAME` / `CLUB_SHORT` in `.env` (later editable in the app's Settings).

## Status
Phase 0 (foundation): health check, club settings, deploy pipeline, backups.
Next, Phase 1: login & roles, fee groups (Big ₹1,200 / Small ₹1,000), students, monthly dues,
recording payments, dashboard.
