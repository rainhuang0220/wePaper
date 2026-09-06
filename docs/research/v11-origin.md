# V1.1 origin isolation — deployment scout (2026-09-07)

Scout: Subagent C (read-only on production nginx; no destructive changes applied).

**Goal:** Move canonical public origin from `https://plainlist.space/wepaper/` to `https://wepaper.plainlist.space/` while keeping one FastAPI instance on `127.0.0.1:8788` and one data dir (`/var/lib/wepaper`).

---

## 1. DNS

| Host | Public resolvers | Server (`dig` on VM) | Notes |
|------|------------------|----------------------|-------|
| `wepaper.plainlist.space` | **A → `175.24.134.228`** (DNSPod `119.29.29.29`, Aliyun `223.5.5.5`, Cloudflare `1.1.1.1`) | **A → `175.24.134.228`** | Record is live |
| `foreshadow.plainlist.space` | A → `175.24.134.228` | same | Sibling reference |
| `wheretoken.plainlist.space` | A → `175.24.134.228` | same | Sibling reference |
| `plainlist.space` | A → `175.24.134.228` | same | Path vhost today |

**Caveat:** Some dev machines behind Clash/Surge may resolve `wepaper.plainlist.space` to a fake `198.18.x.x` address. Use `--resolve wepaper.plainlist.space:443:175.24.134.228` or a public resolver when verifying.

**Prior doc note:** `docs/research/environment.md` (2026-09-06) said no A record; DNS was added since then.

---

## 2. TLS status (now)

| URL | Status |
|-----|--------|
| `https://plainlist.space/wepaper/` | **Working** — valid `plainlist.space` cert, proxies to `:8788`, UI built with `/wepaper/` assets |
| `https://wepaper.plainlist.space/` | **Broken** — no dedicated vhost; SNI falls through to **`foreshadow.plainlist.space`** cert → hostname mismatch |
| `http://wepaper.plainlist.space/` | **404** — no port-80 vhost for this name |
| `/etc/letsencrypt/live/wepaper.plainlist.space/` | **Missing** — not issued yet |

Verified from outside with forced IP:

```bash
curl -svI --resolve wepaper.plainlist.space:443:175.24.134.228 https://wepaper.plainlist.space/
# SSL: no alternative certificate subject name matches target host name 'wepaper.plainlist.space'
# subject: CN=foreshadow.plainlist.space
```

**Abandoned sslip attempt:** `wepaper.175.24.134.228.sslip.io` has an HTTP-only vhost on the server (`/www/server/panel/vhost/nginx/wepaper.175.24.134.228.sslip.io.conf`). Certbot webroot for that name **failed** 2026-09-06 (Tencent ICP intercepts sslip HTTP-01). Do not pursue sslip for wePaper.

---

## 3. Existing nginx vhosts (production)

Base path: `/www/server/panel/vhost/nginx/`

### Active configs (no `.bak` suffix)

| File | Role |
|------|------|
| `plainlist.space.conf` | Main site + **`/wepaper/` reverse proxy** → `127.0.0.1:8788/` |
| `foreshadow.plainlist.space.conf` | Loopback proxy → `:8765` |
| `wheretoken.plainlist.space.conf` | Static SPA + `/api/` → `:3400` |
| `kiln.plainlist.space.conf` | Loopback proxy → `:17777` |
| `wepaper.175.24.134.228.sslip.io.conf` | HTTP-only sslip (no TLS) |

**No** `wepaper.plainlist.space.conf` on the server yet. Repo template exists at `deploy/nginx-wepaper.plainlist.space.conf`.

### Current `/wepaper/` block (inside `plainlist.space.conf` 443 server)

```nginx
location = /wepaper {
    return 301 /wepaper/$is_args$args;
}
location ^~ /wepaper/ {
    proxy_pass http://127.0.0.1:8788/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Range $http_range;
    proxy_set_header If-Range $http_if_range;
    proxy_hide_header Authorization;
    proxy_force_ranges on;
    gzip off;
    client_max_body_size 80m;
}
```

### LetsEncrypt live certs (`/etc/letsencrypt/live/`)

| Directory | Issued |
|-----------|--------|
| `plainlist.space` | yes |
| `foreshadow.plainlist.space` | yes (expires 2026-12-02) |
| `wheretoken.plainlist.space` | yes (expires 2026-12-03) |
| `kiln.plainlist.space` | yes (expires 2026-12-03) |
| `wepaper.plainlist.space` | **no** |

Renewal configs use **`authenticator = webroot`**, **`webroot_path = /var/www/letsencrypt`**.

---

## 4. Sibling cert pattern (copy exactly)

All `*.plainlist.space` siblings share this shape (example: `foreshadow.plainlist.space.conf`):

**Port 80 — ACME + HTTPS redirect**

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name foreshadow.plainlist.space;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        try_files $uri =404;
    }

    location / {
        return 301 https://foreshadow.plainlist.space$request_uri;
    }
}
```

**Port 443 — TLS + app**

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name foreshadow.plainlist.space;

    ssl_certificate     /etc/letsencrypt/live/foreshadow.plainlist.space/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/foreshadow.plainlist.space/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=86400" always;

    location / {
        proxy_pass http://127.0.0.1:8765;
        ...
    }
}
```

**whereToken** differs only in serving a static `root` + `/api/` upstream; ACME block is identical.

**Important:** Do **not** use `includeSubDomains` HSTS on subdomains (comments in sibling configs warn `plainlist.space` is a separate site).

**Repo template for wePaper subdomain:** `deploy/nginx-wepaper.plainlist.space.conf` — matches sibling ACME/redirect/TLS layout; proxies `/` and `/api/` to `127.0.0.1:8788`. **Enhancement needed before cutover:** copy `Range` / `If-Range` / `proxy_force_ranges` / `gzip off` from the path block above into the subdomain vhost (PDF byte-range).

---

## 5. Certbot command (matches siblings)

Siblings were issued with **webroot**, not `--nginx` (renewal params confirm). Recommended sequence:

```bash
# 1. Install HTTP-only server block first (port 80 with acme-challenge root)
sudo cp /home/ubuntu/wepaper/deploy/nginx-wepaper.plainlist.space.conf \
        /www/server/panel/vhost/nginx/wepaper.plainlist.space.conf
# Temporarily comment out the 443 server block OR use a stub 443 until cert exists.
# At minimum, the :80 block with /.well-known/acme-challenge/ must be active.

sudo nginx -t && sudo nginx -s reload

# 2. Issue cert (same webroot as foreshadow/wheretoken/kiln)
sudo certbot certonly --webroot \
  -w /var/www/letsencrypt \
  -d wepaper.plainlist.space

# 3. Uncomment/enable full 443 block, point ssl_certificate* at new live paths
sudo nginx -t && sudo nginx -s reload
```

**Do not** run certbot for `*.sslip.io` on this host — already failed.

Alternative after step 1 if certbot can inject nginx edits: `sudo certbot --nginx -d wepaper.plainlist.space` (documented in `docs/deployment.md`) — but **webroot matches production siblings** and avoids 宝塔 panel fighting certbot on the main `plainlist.space` vhost.

---

## 6. Recommended nginx cutover (parent applies)

### A. Enable subdomain vhost

1. Copy/enhance `deploy/nginx-wepaper.plainlist.space.conf` → `/www/server/panel/vhost/nginx/wepaper.plainlist.space.conf`.
2. Add PDF range headers (from path config).
3. Issue cert (section 5).
4. `nginx -t && nginx -s reload`.
5. Smoke: `curl -fsS https://wepaper.plainlist.space/api/v1/health`.

### B. 301 legacy path → canonical origin (same instance, no data move)

Replace the **proxy** block in `plainlist.space.conf` with redirects that **strip** `/wepaper/`:

```nginx
location = /wepaper {
    return 301 https://wepaper.plainlist.space/$is_args$args;
}
location ^~ /wepaper/ {
    rewrite ^/wepaper/?(.*)$ https://wepaper.plainlist.space/$1 permanent;
}
```

Examples:

| Old | New |
|-----|-----|
| `/wepaper/` | `https://wepaper.plainlist.space/` |
| `/wepaper/api/v1/health` | `https://wepaper.plainlist.space/api/v1/health` |
| `/wepaper/papers/…` | `https://wepaper.plainlist.space/papers/…` |

Apply **after** subdomain HTTPS works and UI is rebuilt with `WEPAPER_BASE=/`.

### C. Optional cleanup

- Disable/remove `wepaper.175.24.134.228.sslip.io.conf` once subdomain is stable.
- Keep `plainlist.space` cert unchanged.

---

## 7. App config keys to change

Same FastAPI process and SQLite/blobs; only public URL surface changes.

| Key | Current (prod) | Target | Where |
|-----|----------------|--------|-------|
| **`WEPAPER_BASE`** | `/wepaper/` (build) | **`/`** (unset or explicit) | `web/` build: `WEPAPER_BASE=/ npm run build`; drives Vite `base` + React Router `basename` via `import.meta.env.BASE_URL` |
| **`WEPAPER_PUBLIC_URL`** | `https://plainlist.space/wepaper` | **`https://wepaper.plainlist.space`** | Server `/home/ubuntu/wepaper/.env`; feeds `Settings.public_url` |
| **CORS `allow_origins`** | `[settings.public_url]` | auto-updates when `WEPAPER_PUBLIC_URL` changes | `src/wepaper/server.py` — no code change if env is correct |
| **`WEPAPER_SERVER_URL`** | `https://plainlist.space/wepaper` | **`https://wepaper.plainlist.space`** | Mac agent env + `~/.config/wepaper/agent.env`; LaunchAgent `space.plainlist.wepaper.plist` sources this file |
| **`WEPAPER_SYNC_TOKEN`** | unchanged | unchanged | server `.env` + `agent.env` |
| **`WEPAPER_DATA_DIR`** | `/var/lib/wepaper` | unchanged | no duplication |
| **`WEPAPER_HOST` / `WEPAPER_PORT`** | `127.0.0.1` / `8788` | unchanged | loopback only |

### Files to update in repo (for next deploy)

- `.env.example` — both URL keys
- `deploy/deploy.sh` — default `WEPAPER_PUBLIC_URL`
- `src/wepaper/launchd.py` — default `WEPAPER_SERVER_URL` in `write_agent_env()`
- `README.md`, `docs/deployment.md`, `docs/sync.md`, `docs/architecture.md` — public URL references
- `web/vite.config.ts` — dev proxy `/wepaper/api` optional to keep for local path testing

### Operator steps (Mac agent)

```bash
export WEPAPER_SERVER_URL=https://wepaper.plainlist.space
export WEPAPER_SYNC_TOKEN=…   # unchanged
uv run wepaper install-agent   # rewrites ~/.config/wepaper/agent.env + reloads LaunchAgent
uv run wepaper doctor
uv run wepaper sync --once
```

### Deploy sequence (app)

```bash
cd web && WEPAPER_BASE=/ npm run build && cd ..
# Update server .env WEPAPER_PUBLIC_URL, then:
./deploy/deploy.sh
sudo systemctl restart wepaper
```

**Prod evidence today:** `web/dist/index.html` references `src="/wepaper/assets/…"` — confirms path-prefix build is live.

---

## 8. Verification checklist (post-cutover)

```bash
# DNS
dig +short wepaper.plainlist.space A @119.29.29.29

# TLS + app
curl -fsS https://wepaper.plainlist.space/api/v1/health
curl -sI https://wepaper.plainlist.space/ | grep -i content-type

# Legacy redirect
curl -sI https://plainlist.space/wepaper/api/v1/health | grep -i location
# expect: https://wepaper.plainlist.space/api/v1/health

# PDF range (after Range headers added to subdomain vhost)
curl -sI -H 'Range: bytes=0-99' \
  'https://wepaper.plainlist.space/api/v1/papers/{key}/pdf' | grep -i content-range

# CORS (browser origin must match WEPAPER_PUBLIC_URL exactly)
# curl -H 'Origin: https://wepaper.plainlist.space' …
```

---

## 9. Summary for parent agent

| Item | Finding |
|------|---------|
| **DNS** | `wepaper.plainlist.space` → **`175.24.134.228`** on public DNS (ready) |
| **TLS** | **Not issued**; HTTPS hits wrong cert (foreshadow); path URL still canonical |
| **nginx** | Path proxy in `plainlist.space.conf`; **no** subdomain vhost; sslip HTTP-only |
| **certbot** | Use **`certbot certonly --webroot -w /var/www/letsencrypt -d wepaper.plainlist.space`** after :80 ACME block is live |
| **App** | Rebuild with **`WEPAPER_BASE=/`**; set **`WEPAPER_PUBLIC_URL`** + **`WEPAPER_SERVER_URL`** to `https://wepaper.plainlist.space`; refresh **`agent.env`** |
| **301** | Replace path **proxy** with **rewrite** to subdomain; same `:8788` backend |

No production nginx files were modified by this scout.
