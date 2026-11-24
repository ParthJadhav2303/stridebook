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
- **Phase 0 (done):** health check, club settings, Docker/Caddy deploy, backups, Azure provisioning, CI.
- **Phase 1 (done):** sign-in with admin and coach roles, fee groups (Big ₹1,200 and Small ₹1,000,
  changeable from a chosen month), students, automatic monthly dues (full fee in the joining month),
  recording Cash/UPI payments (oldest months first, advance allowed), dashboard, dues list,
  WhatsApp reminders and receipts.
- **Next, Phase 2:** Excel import (Student name, Month, Date, Amount paid), Excel export, voiding a
  payment with an activity log, receipt view.

## How fees work
- Every active student gets one fee row per calendar month, from `max(joining month, TRACKING_START)`.
- Joining mid-month still means the full fee for that month.
- A payment fills the oldest unpaid months first (or the months you pick). Extra money becomes advance
  for coming months, up to 12 months.
- Changing a group's fee applies from the month you choose; months with any payment never change.
- Marking a student as left removes unpaid fees after the leaving month. Paused students get no new fees.
