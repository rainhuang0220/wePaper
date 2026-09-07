# wePaper

A personal Zotero paper library on the web.

**Public library:** https://wepaper.plainlist.space

**Source:** https://github.com/rainhuang0220/wePaper

Put papers in a Zotero collection. A local agent copies metadata and PDFs to a small server. Anyone with the URL can browse the list and read the PDF. There is no visitor login. Uploads require a secret.

```
Zotero on your Mac
      │  Local API (read-only)
      ▼
wepaper sync / daemon
      │  HTTPS + bearer token
      ▼
wePaper server  →  public list  →  native / downloadable PDF
```

## Features

- Sync a chosen Zotero collection without writing `zotero.sqlite`
- Public catalog as a dense list (title, authors, year)
- Desktop: click a title → `/paper/:id` → native `/paper/:id/pdf`
- Mobile: tap a title → `/paper/:id` → raw PDF (browser viewer or download)
- `/paper/:id/pdf` is always the real PDF (Range / 206)
- Open reading-status labels (待泛读 … 已精读) with catalog filters
- Per-paper discussion: desktop `评论 · N`, mobile long-press title
- Byte-range PDF transport (`application/pdf`, Range / 206)

## Screenshots

![Library](docs/screenshots/v16-library-desktop.png)

## Requirements

- Zotero 7+ (built against Zotero 10)
- Python 3.12 and [uv](https://astral.sh/uv)
- Node 20+ to build the web UI

## Local development

```bash
uv sync --extra dev
cd web && npm install && npm run build && cd ..
export WEPAPER_DATA_DIR=./data
export WEPAPER_SYNC_TOKEN=dev-token
export WEPAPER_COLLECTION="wePaper,Agent Memory"
export WEPAPER_SERVER_URL=http://127.0.0.1:8788
uv run wepaper serve --host 127.0.0.1 --port 8788
```

```bash
uv run wepaper doctor
uv run wepaper sync --once
```

Open http://127.0.0.1:8788/

## Sync setup

1. Settings → Advanced → **Allow other applications on this computer to communicate with Zotero**
2. Create a collection named `wePaper` (or set `WEPAPER_COLLECTION`)
3. Keep Zotero running while the agent syncs

The agent never writes `zotero.sqlite` and never changes your library.

| Command | Purpose |
| --- | --- |
| `wepaper doctor` | Check Zotero, Local API, collections, token |
| `wepaper sync --once` | One reconcile |
| `wepaper daemon` | Background poll |
| `wepaper install-agent` | macOS launchd (token in `~/.config/wepaper/agent.env`, not the plist) |
| `wepaper serve` | API + UI |

## Server deployment

See [docs/deployment.md](docs/deployment.md). Production origin is `https://wepaper.plainlist.space`.

## Security model

- Public read, bearer-authenticated write
- `WEPAPER_SYNC_TOKEN` must not appear in the frontend, git, or `VITE_*` variables
- Reading-status and comment writes are open and validated; they do not use accounts
- E2E that writes status/comments uses an isolated fixture server, never production papers
- `/openapi.json` is disabled; CSP + `X-Frame-Options: DENY`
- Blob keys are `{sha256}.pdf`; traversal is rejected; upload size is capped
- Visibility: `#wepaper:private` hides list + PDF; collection removal hides

## Testing

```bash
uv run pytest
cd web && npm run e2e
```

## Reader architecture

The server stores real PDF blobs and serves them as `application/pdf` with byte ranges. `/paper/:id` 302s to `/paper/:id/pdf` on every device (browser-native PDF or download). `/paper/:id/pdf` stays raw PDF. The v1.5 Android inline viewer is not the default reading path.

## License

MIT. Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
