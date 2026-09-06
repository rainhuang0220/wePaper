# wePaper

A personal Zotero paper library on the web.

**Public library:** https://wepaper.plainlist.space

Put papers in a Zotero collection. A local agent copies metadata and PDFs to a small server. Anyone with the URL can browse the list and read the PDF. There is no visitor login. Uploads require a secret.

```
Zotero on your Mac
      │  Local API (read-only)
      ▼
wepaper sync / daemon
      │  HTTPS + bearer token
      ▼
wePaper server  →  public list  →  PDF.js reader
```

## Requirements

- Zotero 7+ (this project was built against Zotero 10)
- Python 3.12 and [uv](https://github.com/astral-sh/uv)
- Node 20+ to build the web UI

## Run locally

```bash
uv sync --extra dev
cd web && npm install && npm run build && cd ..
export WEPAPER_DATA_DIR=./data
export WEPAPER_SYNC_TOKEN=dev-token
export WEPAPER_COLLECTION="wePaper,Agent Memory"
export WEPAPER_SERVER_URL=http://127.0.0.1:8788
uv run wepaper serve --host 127.0.0.1 --port 8788
# other terminal
uv run wepaper doctor
uv run wepaper sync --once
```

Open http://127.0.0.1:8788/

## Zotero

1. Settings → Advanced → **Allow other applications on this computer to communicate with Zotero**
2. Create a collection named `wePaper` (or set `WEPAPER_COLLECTION`)
3. Keep Zotero running while the agent syncs

The agent never writes `zotero.sqlite` and never changes your library.

## Commands

| Command | Purpose |
| --- | --- |
| `wepaper doctor` | Check Zotero, Local API, collections, token |
| `wepaper sync --once` | One reconcile |
| `wepaper daemon` | Background poll (single instance) |
| `wepaper status` | Last cursor |
| `wepaper install-agent` | macOS launchd |
| `wepaper serve` | API + UI |

## Secrets

`WEPAPER_SYNC_TOKEN` authenticates every write. It must not appear in the frontend, in git, or in `VITE_*` variables. See `.env.example`.

## Visibility

V1 lists `public` papers. `#wepaper:private` hides a paper from the list and the PDF route. Removing an item from the collection hides it. The operator is the publisher of record — wePaper does not decide copyright.

## Tests

```bash
uv run pytest
```

## Docs

- [Architecture](docs/architecture.md)
- [Sync](docs/sync.md)
- [Deployment](docs/deployment.md)
- [Architecture review](ARCHITECTURE_REVIEW.md)
- [Prior art](REFERENCE_RESEARCH.md)

## Production sync (this Mac)

```bash
export WEPAPER_SERVER_URL=https://wepaper.plainlist.space
export WEPAPER_SYNC_TOKEN=…          # from /home/ubuntu/wepaper/.env
export WEPAPER_COLLECTION="wePaper,Agent Memory"
uv run wepaper doctor
uv run wepaper sync --once
uv run wepaper install-agent         # launchd; token lives in ~/.config/wepaper/agent.env
```

There is no `wePaper` collection on this library yet. Papers currently published come from **Agent Memory**. Create a Zotero collection named `wePaper` when you want that to be the publish set.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| `403 Local API is not enabled` | Enable the Advanced checkbox; restart Zotero |
| `Zotero is not running` | Open Zotero, then `wepaper doctor` |
| Collection not found | `WEPAPER_COLLECTION` must match a real name |
| Writes return 401 | Token on the agent and server must match |
| PDF 404 after removal | Expected: hide unpublishes the file |
