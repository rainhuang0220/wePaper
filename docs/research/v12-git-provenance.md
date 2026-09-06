# V1.2 git provenance audit (2026-09-07)

Facts only. Commands run from `/Users/rainhuang/Desktop/wePaper`.

---

## Authoritative source tree

| Field | Value |
|-------|-------|
| `pwd` | `/Users/rainhuang/Desktop/wePaper` |
| `git rev-parse --show-toplevel` | `/Users/rainhuang/Desktop/wePaper` |
| Git repo | Yes (local only) |
| Current branch | `main` |
| `HEAD` | `0ee7e3dce9c44fe2d7d61d0ce8614700d573b0bb` (`0ee7e3d`) |

---

## Commit history (all branches)

```
0ee7e3d (HEAD -> main) Ship V1.1: wepaper.plainlist.space, library list, continuous PDF reader.
42cf3a6 Harden sync writes and fix the public reader after review.
69823fb Ship wePaper: Zotero sync agent, public library, and HTTPS deploy.
```

Total commits on `main`: 3. No other branches. No tags.

---

## Target commits

| Short SHA | `git cat-file -t` | Full SHA | Subject |
|-----------|-------------------|----------|---------|
| `42cf3a6` | `commit` | `42cf3a6020a22d8aa27cadca2e1f4ef5c2a6e932` | Harden sync writes and fix the public reader after review. |
| `0ee7e3d` | `commit` | `0ee7e3dce9c44fe2d7d61d0ce8614700d573b0bb` | Ship V1.1: wepaper.plainlist.space, library list, continuous PDF reader. |

Both objects exist in the local object database.

---

## Remotes and push state

| Check | Result |
|-------|--------|
| `git remote -v` | *(empty — no remotes configured)* |
| `.git/config` | No `[remote …]` sections |
| `git branch -vv` | `main` at `0ee7e3d`; no upstream tracking branch |
| Git push to GitHub | Not possible from this clone (no remote) |

Deployment path documented in `deploy/deploy.sh`: `rsync` over SSH to `ubuntu@175.24.134.228:/home/ubuntu/wepaper` (not `git push`).

---

## GitHub

| Check | Result |
|-------|--------|
| `gh auth status` | Logged in to `github.com` as `rainhuang0220` (keyring); token scopes include `repo` |
| `gh repo view rainhuang0220/wePaper` | **Does not exist** — `GraphQL: Could not resolve to a Repository with the name 'rainhuang0220/wePaper'.` |

No GitHub remote was created or used by this local repo.

---

## Working tree (at audit time)

```
 M TASK_LEDGER.md
 M docs/research/v11-origin.md
?? .grok/skills/wepaper-v12/
```

Uncommitted changes do not touch `web/src/` or `web/index.html`.

---

## Production vs local HEAD (HTML/JS)

Production URL: `https://wepaper.plainlist.space` (verified with `--resolve wepaper.plainlist.space:443:175.24.134.228`).

| Asset | Production | Local build from HEAD source (`npm ci && npm run build` in `web/`) |
|-------|------------|---------------------------------------------------------------------|
| `index.html` | `/assets/index-DYT3da3w.js`, `/assets/index-Bval81D-.css` | Same asset filenames |
| SHA-256 `index.html` | `3f31b2e37acfca0f4ce66370eddc56a5c4c63a81c595834f6ffccab1229c2ac0` | Identical |
| SHA-256 `index-DYT3da3w.js` | `e84892c04a913a9c87d853273a3dd27dbb8c560f43318c15ee1de10b194b8d26` (660,382 bytes) | Identical |
| SHA-256 `index-Bval81D-.css` | `e1786ad1ca2be5dc3704c2cd4bbf6e2da83212be24fe9b6f72e8d7ce605bb6d2` | Identical |

`web/dist/` is listed in `.gitignore`; production serves built artifacts from the server copy produced by deploy + `vite build`.

`/api/v1/health` on production returned `{"status":"ok"}`.

**Conclusion:** Production HTML/JS byte-matches a fresh Vite build from the committed source tree at `HEAD` (`0ee7e3d`).

---

## Commands executed

```
pwd
git rev-parse --show-toplevel
git rev-parse HEAD
git status --short
git branch --show-current
git remote -v
git log --oneline --decorate -30
git cat-file -t 42cf3a6
git cat-file -t 0ee7e3d
git show --stat --oneline 42cf3a6
git show --stat --oneline 0ee7e3d
gh auth status
gh repo view rainhuang0220/wePaper
```

Additional checks: `git branch -vv`, `git reflog show --all`, local `npm run build`, SHA-256 compare of production vs local `web/dist/`, `curl` of production `/` and `/api/v1/health`.

---

## Update (2026-09-07, after publication)

The tree above was the pre-push snapshot. The dedicated public repository now exists and contains this history:

- https://github.com/rainhuang0220/wePaper
- `42cf3a6`: https://github.com/rainhuang0220/wePaper/commit/42cf3a6020a22d8aa27cadca2e1f4ef5c2a6e932
- `0ee7e3d`: https://github.com/rainhuang0220/wePaper/commit/0ee7e3dce9c44fe2d7d61d0ce8614700d573b0bb
- `v1.2.0`: https://github.com/rainhuang0220/wePaper/releases/tag/v1.2.0
- `v1.2.1`: https://github.com/rainhuang0220/wePaper/releases/tag/v1.2.1
- `v1.2.2`: first-page Range transport + persist-after-paint (this commit)

