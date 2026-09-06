# Environment reconnaissance (2026-09-06)

## Local Mac

- Zotero **10.0.1** running; Connector ping OK at `127.0.0.1:23119`.
- Local API present but **disabled** (`403 Local API is not enabled`). Enable via Settings → Advanced → “Allow other applications on this computer to communicate with Zotero”.
- Better BibTeX JSON-RPC is reachable.
- Data dir: `~/Zotero`. Live `zotero.sqlite` is locked while Zotero runs.
- Collections (from BBT + sqlite.bak, read-only): `Agent Memory` (`M277TYYA`), `MIS` (`WU6FW67F`). No `wePaper` collection yet.
- ~14 attachments / several PDFs under `storage/<attachmentKey>/`.

## Production host

- `ubuntu@175.24.134.228` (Tencent Cloud, hostname `VM-0-8-ubuntu`). SSH works with default key. `sudo` is passwordless.
- nginx is 宝塔 (`/www/server/panel/vhost/nginx/`). HTTPS already used by sibling products.
- Domain zone: **plainlist.space** (DNSPod). Existing hosts: `plainlist.space`, `wheretoken.plainlist.space`, `foreshadow.plainlist.space`, `kiln.plainlist.space`, `get.plainlist.space`.
- **`wepaper.plainlist.space` has no A record yet.** Sibling pattern is A → `175.24.134.228` + certbot HTTP-01.
- Disk ~90% (≈5.1G free). Prefer a small venv/binary, not a large image pull.
- Python 3.10 system; Node 20; Docker present. Existing apps use systemd/loopback + nginx proxy.

## SSH that does not work

- `jhx` / `202.201.163.132`: publickey rejected (needs interactive auth). Not used.
