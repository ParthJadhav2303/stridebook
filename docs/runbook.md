# StrideBook — Phase 0 runbook

Goal: the "System check" page live on HTTPS on Azure, with nightly backups running.
Time: about 1–1.5 hours the first time.

## 0. What you need
- A GitHub account (repo can be private).
- Azure CLI on your laptop (`az version`), or use Azure Cloud Shell in the portal.
- An SSH key: `ssh-keygen -t ed25519` if `~/.ssh/id_ed25519.pub` doesn't exist.

## 1. Push the code to GitHub
```bash
cd stridebook
git init -b main && git add . && git commit -m "Phase 0 scaffold"
gh repo create stridebook --private --source . --push     # or create on github.com and push
```
The **CI** workflow runs tests, builds the app, and on `main` pushes three images to
`ghcr.io/<your-username>/stridebook-{api,web,backup}`.

## 2. Create the Azure subscription and budget
1. Portal → **Subscriptions → Add** → *Pay-As-You-Go*. Add a payment card. Note the subscription ID.
2. Portal → **Cost Management → Budgets → Add**: scope = the new subscription, amount **₹1,200**,
   monthly, alerts at **80% and 100%** to your email.
3. `az login && az account set -s <subscription-id>`

## 3. Create the resources
```bash
ADMIN_IP=$(curl -s https://ifconfig.me) ./infra/provision.sh
```
Creates: resource group `rg-stridebook`, VM `Standard_B2ats_v2` (Ubuntu 24.04, 32 GB SSD) with
Docker, swap, fail2ban and auto security updates, a firewall (80/443 open, SSH only from your IP),
and a private Cool-tier storage account with automatic backup expiry.
**Save the three values it prints** (SITE_ADDRESS, BACKUP_CONTAINER_URL, BACKUP_SAS).

Wait ~3 minutes for first-boot setup, then check: `ssh stride@<fqdn> 'docker --version && free -h'`.

> Your home IP changes? Update SSH access:
> `az network nsg rule update -g rg-stridebook --nsg-name vm-stridebookNSG -n allow-ssh-admin --source-address-prefixes $(curl -s https://ifconfig.me)`

## 4. Configure the VM (once)
```bash
scp .env.example stride@<fqdn>:/opt/stridebook/.env
ssh stride@<fqdn>
cd /opt/stridebook && nano .env
```
Fill in:
- `SITE_ADDRESS`, `BACKUP_CONTAINER_URL`, `BACKUP_SAS`: from step 3
- `IMAGE_PREFIX=ghcr.io/<your-github-username>` (lowercase)
- `POSTGRES_PASSWORD` and `SECRET_KEY`: run `openssl rand -hex 32` for each
- `chmod 600 .env`

Let the VM pull private images. On GitHub: **Settings → Developer settings → Personal access tokens
(classic)** → scope **read:packages** only. Then on the VM:
```bash
echo <token> | docker login ghcr.io -u <your-github-username> --password-stdin
```

## If CI fails in a few seconds
Open the failed run. If it says *"The job was not started because your account is locked due to a
billing issue"*, GitHub Actions is blocked on your account (nothing is wrong with the code). Fix it in
GitHub → **Settings → Billing and plans** (update the payment method or pay the outstanding bill), then
**Actions → CI → Run workflow**. Until then, deploy with `./infra/deploy-from-source.sh <fqdn>` and
skip the `docker login ghcr.io` step.

## 5. Deploy
From your laptop, after CI is green on `main`:
```bash
./infra/deploy.sh <fqdn>            # deploys "latest"
./infra/deploy.sh <fqdn> <git-sha>  # or a specific build (also how you roll back)
```
Open `https://<fqdn>` on a phone. You should see **System check** with Server, Database and
Version all green. Use the browser menu → *Add to Home screen*.

### Create the logins (once)
```bash
ssh stride@<fqdn>
cd /opt/stridebook
docker compose exec api python -m app.cli create-user --username mom --name "<Mom's name>" --role admin
```
It asks for a password (at least 8 characters). Sign in on Mom's phone, then add the two coaches
from **More → Coaches and logins**. Give each coach their password in person.

## 6. Prove backups work
```bash
ssh stride@<fqdn>
cd /opt/stridebook
docker compose exec backup backup.sh        # run one now; prints "backup OK"
```
Portal → storage account → *backups* container → `daily/` should contain the file.

**Restore drill (do monthly):** download the latest `.dump` from the portal, then
```bash
scp stridebook-XXXX.dump stride@<fqdn>:/tmp/
ssh stride@<fqdn> 'cd /opt/stridebook && docker compose cp /tmp/stridebook-XXXX.dump backup:/tmp/restore.dump && docker compose exec -it backup restore.sh /tmp/restore.dump'
```

## 7. Uptime monitoring (free)
Create a free HTTP monitor (e.g. UptimeRobot) for `https://<fqdn>/api/health`, 5-minute interval,
email alerts.

## Day-to-day
| Task | Command (on the VM in /opt/stridebook) |
|---|---|
| Status | `docker compose ps` |
| Logs | `docker compose logs -f api` |
| Restart | `docker compose restart api` |
| Disk / memory | `df -h && free -h` |
| Resize VM if memory is tight | `az vm resize -g rg-stridebook -n vm-stridebook --size Standard_B2als_v2` (~5 min downtime) |

**Calendar reminders:** backup SAS token expiry (date printed by provision.sh): re-run the SAS
command from `provision.sh` and update `.env`. Monthly restore drill.

## Local development
```bash
# Backend (needs a local Postgres)
cd backend && pip install -r requirements-dev.txt
export DATABASE_URL=postgresql+psycopg://stridebook:stridebook@localhost:5432/stridebook
alembic upgrade head
python -m app.cli create-user --username admin --name "Local Admin" --role admin
uvicorn app.main:app --reload            # http://localhost:8000/api/docs
pytest -q                                # uses DATABASE_URL pointing at a *test* database

# Frontend (proxies /api to :8000)
cd frontend && npm install && npm run dev   # http://localhost:5173

# Or the whole stack exactly like production, over plain HTTP:
cp .env.example .env   # set SITE_ADDRESS=:80, POSTGRES_PASSWORD, SECRET_KEY
docker compose up --build                  # http://localhost
```
