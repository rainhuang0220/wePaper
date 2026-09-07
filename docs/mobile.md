# Mobile reading

v1.6.0 uses one reading path on every device.

```
Library title → /paper/:id → 302 /paper/:id/pdf → application/pdf
```

`/paper/:id/pdf` is always the raw file. Tools, Zotero, and `curl` get the same bytes. The 302 sends `Cache-Control: private, no-store` and `Vary: Sec-CH-UA-Mobile, User-Agent`.

## Desktop

The browser’s built-in PDF viewer opens the file. wePaper does not load PDF.js on this path and does not add reader chrome.

## Mobile

The same 302 is used. Reliability comes first.

- Some Android and iOS browsers display the PDF inline.
- Others show a download prompt.

Both are the intended fallback. wePaper does **not** claim a working inline Android viewer. v1.5.0 tried official PDF.js as the Android default and produced a dead page (“The PDF could not be opened.”). That default is gone.

`/paper/:id/viewer` still serves a diagnostic HTML viewer for local debugging. Catalog titles do not use it.

## Discussion entry

A tap on the title starts reading. A long-press (about 480 ms) opens `/paper/:id/discussion` and does not follow the PDF afterward. `评论 · N` is the visible discussion control on phone and desktop.

See [android-reader-failure.md](research/android-reader-failure.md) for the v1.5 investigation.
