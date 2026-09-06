# Deployment

Production host: `ubuntu@175.24.134.228` (宝塔 nginx + systemd).

Public URL (V1): `https://plainlist.space/wepaper`

Intended dedicated host once DNS exists: `https://wepaper.plainlist.space`

Tencent intercepts HTTP-01 for unregistered hostnames (sslip/nip and new subdomains without a filed record). A path on the already-HTTPS `plainlist.space` vhost is the working public door. The FastAPI app still listens on `127.0.0.1:8788` at `/`; nginx strips the `/wepaper/` prefix.

## Server layout

```
/home/ubuntu/wepaper/
  src/ web/dist/ pyproject.toml
  .venv/
  .env                 # 0600, contains WEPAPER_SYNC_TOKEN
/var/lib/wepaper/      # sqlite + blobs
```

Process: `uvicorn` on `127.0.0.1:8788` via systemd `wepaper.service`.

nginx (inside the existing `plainlist.space` 443 server, before `location /`):

```
location = /wepaper { return 301 /wepaper/; }
location ^~ /wepaper/ {
    proxy_pass http://127.0.0.1:8788/;
    ...
}
```

The web UI is built with `WEPAPER_BASE=/wepaper/` so asset URLs and the React Router basename match the public path.

## Deploy

From a trusted machine with SSH to `ubuntu@175.24.134.228`:

```bash
cd web && WEPAPER_BASE=/wepaper/ npm run build && cd ..
./deploy/deploy.sh
```

The script rsyncs the repo (no `.venv`, no local `data/`, no `.env`), runs `uv sync` on the server, restarts systemd, and smoke-tests loopback `/api/v1/health`.

To attach the public path (once):

```bash
sudo python3 /home/ubuntu/wepaper/deploy/install_plainlist_path.py
sudo nginx -t && sudo nginx -s reload
```

## DNS + TLS (optional dedicated host)

DNS is DNSPod. Add:

```
wepaper.plainlist.space  A  175.24.134.228
```

Then, on the server:

```bash
sudo certbot --nginx -d wepaper.plainlist.space
```

HTTP-01 uses `/var/www/letsencrypt` like the sibling vhosts. Rebuild the UI with `WEPAPER_BASE=/` if you switch to the apex of that subdomain.

## Secrets

- Generate: `python3 -c 'import secrets; print(secrets.token_urlsafe(32))'`
- Store only in `/home/ubuntu/wepaper/.env` and the Mac agent environment.
- Never `VITE_*`, never the frontend bundle, never git.

Agent:

```bash
export WEPAPER_SERVER_URL=https://plainlist.space/wepaper
export WEPAPER_SYNC_TOKEN=...   # from server .env
export WEPAPER_COLLECTION="wePaper,Agent Memory"
uv run wepaper doctor
uv run wepaper sync --once
```

## Restart

```bash
sudo systemctl restart wepaper
sudo systemctl status wepaper
```

SQLite and blobs live under `WEPAPER_DATA_DIR` and survive process restart.
