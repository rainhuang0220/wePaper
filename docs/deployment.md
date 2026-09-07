# Deployment

Operator guide for the v1.6.0 server. Product pages: [index](README.md).

**Demo origin:** `https://wepaper.plainlist.space`

Legacy `https://plainlist.space/wepaper/` 301-redirects to that origin (same process and data directory).

## Any Linux host

1. `uv sync` and `cd web && npm install && npm run build`
2. Put `WEPAPER_DATA_DIR`, `WEPAPER_SYNC_TOKEN`, and `WEPAPER_PUBLIC_URL` in a `0600` `.env`
3. Run `uv run wepaper serve` on loopback (default `127.0.0.1:8788`)
4. Put nginx (or another reverse proxy) in front with TLS. Keep `proxy_cache` **off** for this vhost — a cached PDF `206` can replace the file with a fragment. Do not gzip `application/pdf`.
5. Use `deploy/wepaper.service` and `deploy/nginx-wepaper.plainlist.space.conf` as templates.

Reading-status and comment writes are public and validated. The sync bearer token is required for Zotero ingest. Automated tests must use an isolated database, never the production database.

## Current demo host

The public demo uses systemd + nginx in front of uvicorn on `127.0.0.1:8788`. SQLite and blobs live under `/var/lib/wepaper` (`0700`). The web UI is built with `WEPAPER_BASE=/`.

From a machine that already has SSH access to that host:

```bash
cd web && npm run build && cd ..
./deploy/deploy.sh
```

The script rsyncs the repo (no `.venv`, no local `data/`, no `.env`), keeps `WEPAPER_PUBLIC_URL` on the server, restarts systemd, and smoke-tests loopback `/api/v1/health`.

nginx must forward `Range` / `If-Range`. Gzip JS/CSS/JSON only.

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

## Environment

Server (`.env`, mode `0600`):

| Variable | Role |
| --- | --- |
| `WEPAPER_DATA_DIR` | SQLite + blobs (production: `/var/lib/wepaper`) |
| `WEPAPER_SYNC_TOKEN` | Bearer secret for `/api/v1/sync/*` |
| `WEPAPER_PUBLIC_URL` | Canonical origin |
| `WEPAPER_HOST` / `WEPAPER_PORT` | uvicorn bind (`127.0.0.1:8788`) |
| `WEPAPER_MAX_UPLOAD_BYTES` | Attachment cap (default 80 MiB) |

Agent:

| Variable | Role |
| --- | --- |
| `WEPAPER_COLLECTION` | Collection names, comma-separated |
| `WEPAPER_SERVER_URL` | Server origin the agent calls |
| `WEPAPER_SYNC_TOKEN` | Same bearer as the server |
| `WEPAPER_POLL_SECONDS` | Daemon interval (default 60) |
| `WEPAPER_STATE_DIR` | Agent cursor + `agent.env` (default `~/.config/wepaper`) |
| `WEPAPER_ZOTERO_API` | Local API (default `http://127.0.0.1:23119/api`) |
