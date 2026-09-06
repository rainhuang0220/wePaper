# Deployment

Production host: `ubuntu@175.24.134.228` (宝塔 nginx + systemd).

**Canonical URL:** `https://wepaper.plainlist.space`

Legacy `https://plainlist.space/wepaper/` 301-redirects to the subdomain (same FastAPI process, same `/var/lib/wepaper` data).

## Server layout

```
/home/ubuntu/wepaper/
  src/ web/dist/ pyproject.toml
  .venv/
  .env                 # 0600, contains WEPAPER_SYNC_TOKEN
/var/lib/wepaper/      # sqlite + blobs, 0700
```

Process: `uvicorn` on `127.0.0.1:8788` via systemd `wepaper.service`.

TLS: Let's Encrypt `wepaper.plainlist.space` via webroot `/var/www/letsencrypt`.

nginx vhost: `/www/server/panel/vhost/nginx/wepaper.plainlist.space.conf` (repo: `deploy/nginx-wepaper.plainlist.space.conf`). Proxies `/` → `127.0.0.1:8788` with `Range` / `If-Range` and **`proxy_cache off`**. 宝塔’s global `proxy.conf` turns `proxy_cache` on; caching a PDF `206` would replace the file with a 64KB fragment. Gzip is on for JS/CSS/JSON only — `application/pdf` is not in `gzip_types`, so byte ranges stay valid.

## Deploy

From a trusted machine with SSH to `ubuntu@175.24.134.228`:

```bash
cd web && npm run build && cd ..
./deploy/deploy.sh
```

The script rsyncs the repo (no `.venv`, no local `data/`, no `.env`), keeps `WEPAPER_PUBLIC_URL=https://wepaper.plainlist.space` on the server, restarts systemd, and smoke-tests loopback `/api/v1/health`.

The web UI is built with `WEPAPER_BASE=/`.

## Agent

```bash
export WEPAPER_SERVER_URL=https://wepaper.plainlist.space
export WEPAPER_SYNC_TOKEN=...   # from server .env; never in the plist
export WEPAPER_COLLECTION="wePaper,Agent Memory"
uv run wepaper doctor
uv run wepaper sync --once
uv run wepaper install-agent
```

## Restart

```bash
sudo systemctl restart wepaper
sudo systemctl status wepaper
```

SQLite and blobs live under `WEPAPER_DATA_DIR` and survive process restart.
