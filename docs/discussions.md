# Reading status and discussions

v1.6 has no visitor accounts. Anyone with the library URL can change a status, comment, reply, or like. That is a small-audience product choice, not an unfinished auth system.

## Reading status

Each paper has zero or one status on `papers.reading_status`:

| Stored value | Label |
| --- | --- |
| `pending_browse` | 待泛读 |
| `pending_deep` | 待精读 |
| `browsing` | 泛读中 |
| `deep_reading` | 精读中 |
| `browsed` | 已泛读 |
| `deep_read` | 已精读 |
| `NULL` | 无状态 (`状态` in the catalog) |

The catalog chip opens a menu. Changing status does not open the paper.

Filters: 全部, each of the six labels, and the groups 待读 / 阅读中 / 已读. Search and status filters combine.

`PATCH /api/v1/papers/:id/status` is public. The body is an enum or `null`. Zotero upsert never writes this column.

## Discussions

Route: `/paper/:id/discussion` (refreshable, shareable).

| Action | Who | Notes |
| --- | --- | --- |
| View | anyone | Empty state: “还没有评论。写下第一句讨论。” |
| Comment | anyone | Body 1–2000 characters after trim. Optional 署名, 40 characters. |
| Reply | anyone | One level only. Replies cannot be nested further. |
| Like | anyone | Server increments `like_count`. The browser remembers liked ids in `localStorage`. |

Catalog rows show `评论 · N` (thread size, including replies) without loading comment bodies.

Hidden, private, and tombstoned papers 404 the discussion API. If the same `zotero_item_key` later becomes public again, the thread is still there.

## Safety (not abuse-proof)

- Length limits and empty-body rejection
- SQL parameterization
- Comment bodies rendered as React text, not HTML
- No filesystem access from comment routes

There is no CAPTCHA, rate limit, or moderation UI. Clearing `localStorage` can like again.

## Tests

Status and comment E2E tests start an isolated server with fixture keys (`TEST0001`, `TEST0002`). They must not write the operator’s real papers.
