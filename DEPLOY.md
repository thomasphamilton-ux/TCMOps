# Deploying TCM to the VPS (tcmops.com)

Target: AlmaLinux 9 VPS at `108.175.7.151`, running Plesk, domain `tcmops.com`
registered through IONOS. Plesk owns ports 80/443 and SSL for the box — the
app runs in Docker on `127.0.0.1`-only ports, and Plesk's nginx reverse-proxies
the domain into it. Nothing else runs its own web server or touches 80/443.

## 1. DNS (IONOS)

In the IONOS DNS management panel for `tcmops.com`, point it at the VPS:

| Type | Host | Value             |
|------|------|--------------------|
| A    | @    | `108.175.7.151`    |
| A    | www  | `108.175.7.151`    |

DNS propagation can take a few minutes to a few hours. Confirm it's live
before continuing:

```bash
dig +short tcmops.com
dig +short www.tcmops.com
```

## 2. Add the domain in Plesk

1. Plesk → **Websites & Domains** → **Add Domain** → `tcmops.com`.
2. Once created, open it → **SSL/TLS Certificates** → **Get it free** (Let's
   Encrypt). Include `www.tcmops.com` in the same certificate. Enable
   **Redirect from HTTP to HTTPS**.

Plesk now auto-renews the cert — no certbot/cron setup needed on your end.

## 3. Install Docker (AlmaLinux 9)

SSH into the VPS as root or a sudo user, then:

```bash
sudo dnf -y install dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
docker --version
docker compose version
```

This installs Docker Compose as the `docker compose` (v2) subcommand — that's
what the commands below use.

> **SELinux note:** AlmaLinux ships SELinux in enforcing mode by default. If
> containers fail to start or can't write to a mounted volume, check
> `sudo journalctl -u docker` and `sudo ausearch -m avc -ts recent` for denials
> before assuming it's a Docker config problem.

## 4. Push the code to GitHub, then clone it on the VPS

This repo is already git-initialized and committed locally. From your own
machine:

```bash
# Create an empty repo on GitHub first (github.com/new — no README/license,
# so it stays empty for this push), then:
git remote add origin https://github.com/<your-username>/<repo-name>.git
git branch -M main
git push -u origin main
```

Then on the VPS:

```bash
sudo mkdir -p /opt/tcm
sudo chown $USER:$USER /opt/tcm
git clone https://github.com/<your-username>/<repo-name>.git /opt/tcm
cd /opt/tcm
```

(Private repo? Use a GitHub personal access token in the clone URL, or set up
a deploy key — either works, just don't put the token in shell history longer
than needed.)

## 5. Configure production `.env`

```bash
cp .env.example .env
nano .env   # or vi
```

Fill in:

- **`JWT_SECRET`** — generate a fresh one, don't reuse the dev value:
  ```bash
  openssl rand -base64 48
  ```
- **`POSTGRES_PASSWORD`** — a strong password. Must exactly match the password
  segment of `DATABASE_URL` below it.
- **`DATABASE_URL`** — `postgres://postgres:<same-password>@db:5432/quicktime`
  (host stays `db` — that's the Docker Compose service name, not a real
  hostname).
- **`CORS_ORIGIN`** — `https://tcmops.com,https://www.tcmops.com`
- **`SEED_ADMIN_PHONE`** / **`SEED_ADMIN_PIN`** — real values for the first
  production admin login. Use a PIN longer than 4 digits; you can (and should)
  change it from the Users page immediately after first login.
- **`DOMAIN`** — `tcmops.com`
- SMTP fields — optional, only needed if you want export-ready email
  notifications.

## 6. Build and start the containers

```bash
docker compose up -d --build
docker compose ps        # all three should show "Up"
docker compose logs -f backend   # Ctrl+C once you see it listening on :3000
```

## 7. Initialize the database

```bash
docker compose exec backend npm run db:push
docker compose exec backend npm run db:seed
```

`db:seed` prints the admin login it just created — that's your first login on
`https://tcmops.com` once step 8 is done. (`db:push` applies the schema
directly; it's what this project has used throughout development. For a
long-lived production system you may eventually want to switch to versioned
migrations via `drizzle-kit generate` + `migrate`, but `push` is fine to start
and for any solo-admin deployment like this one.)

## 8. Point Plesk's nginx at the containers

Plesk → **Websites & Domains** → `tcmops.com` → **Apache & nginx Settings** →
scroll to **Additional nginx directives** → paste:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /files/ {
    proxy_pass http://127.0.0.1:3000/files/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location / {
    proxy_pass http://127.0.0.1:5173;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Apply, and Plesk reloads its nginx automatically.

## 9. Smoke test

```bash
curl -sI https://tcmops.com/api/health
```

Should return `200`/JSON `{"status":"ok"}` (via `-i` if you want the body
too). Then open `https://tcmops.com` in a browser, log in with the seeded
admin, and confirm the app loads — including a direct visit to a route like
`https://tcmops.com/dashboard` (not just clicking there from `/`), which
exercises the SPA-fallback fix in `frontend/nginx.conf`.

If clock-in geolocation or camera capture matters for your testing, remember
browsers only grant those permissions on `https://` or `localhost` — this
deployment is HTTPS via Plesk, so that's already covered.

## 10. Deploying updates later

```bash
cd /opt/tcm
git pull
docker compose up -d --build
# If the update includes a schema change:
docker compose exec backend npm run db:push
```

## What's deliberately NOT in this setup

- No nginx/certbot container — Plesk already owns 80/443 and cert renewal.
- No CI/CD auto-deploy — `ci/github-actions.yml` in the repo is leftover
  scaffolding that doesn't actually deploy anywhere (no SSH step, no VPS
  secrets). Updates are the manual `git pull` + `docker compose up -d --build`
  above. Fine for a single-admin deployment; revisit if that becomes a
  bottleneck.
- Backend runs via `tsx` directly against the TypeScript source (no separate
  compile step) — matches how it's run in dev, works fine at this app's scale.
