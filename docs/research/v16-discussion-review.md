# wePaper V1.6 — Discussion / product interaction review

**Job.** Review comments as a *paper-adjacent note thread*, not as a social product.  
**Date.** 2026-09-07.  
**Constraint.** Do not recommend feeds, follows, profiles, avatars, notifications, ranking, infinite reply trees, or reaction kits. Open writes stay anonymous and validated.

**Sources**

| Source | What it shows |
| --- | --- |
| `web/src/pages/DiscussionPage.tsx` | Composer, one-level replies, like + localStorage, `← Library` |
| `web/src/pages/LibraryPage.tsx` | Desktop `评论 · N` link; mobile title long-press (480 ms) |
| `web/src/styles.css` | Catalog meta, composer, thread, 720 px mobile wrap |
| `web/src/api.ts`, `src/wepaper/comments.py`, `src/wepaper/server.py` | Count = thread size; reply depth 1; like is increment-only |
| `docs/screenshots/v16-library-{desktop,mobile}.png` | Catalog entry at 0 and 2 |
| `docs/screenshots/v16-discussion-{desktop,mobile}.png` | Empty discussion (composer + empty copy) |
| `web/e2e/discussion.spec.ts` | Desktop click → reply → like → back; mobile long-press does not open PDF |

Screenshots are **empty-thread** captures (`TEST0001`). A populated replies shot is only taken if `TEST0002` already has bodies (`web/e2e/screenshots.spec.ts`). Hierarchy, like, and long comments were judged from code + the desktop E2E, not from a populated PNG.

**Verdict (initial).** No HIGH. Four MEDIUM. The shape is right: per-paper, one-level, optional name, text like, `评论 · 0` still an entry. The breaks are attachment (reply, paper, keyboard) and an untaught long-press that steals copy.

**Addressed before ship:** M1 (16px composer fields, `interactive-widget=resizes-content`, 44px submit), M2 (回复 names the parent, highlights the comment, focuses the composer), M3 (title opens `/paper/:id`; `← Library` keeps catalog search). M4 is accepted: long-press remains a required discussion shortcut and still suppresses the system callout so it cannot open the PDF afterward.

---

## Per-dimension

### Discoverability — LOW (intentional quiet)

Desktop `评论 · N` sits on the metadata row after status and authors, 12 px, `--muted` (`#888`), no underline. Mobile wraps authors to a full line, so `评论 · N` is its own 32 px-tall row. Both screenshots show `评论 · 0` and `评论 · 2` — zero is still an entry, which is correct.

It reads as census, not a button. That is acceptable. Promoting it into a badge, bubble, or icon count would make the catalog look like a feed. Hover → ink on desktop is enough. Mobile has no hover; the extra line is the affordance.

There is no discussion entry on the native PDF surface. That is architecture (`/paper/:id` → 302 `/pdf`; desktop PDF frozen), not a missing chrome widget. Do not invent a reader overlay to host comments.

### Desktop `评论 · N` — OK

Real `<a href={discussionUrl}>` with `stopPropagation` on click and pointerdown, so the title’s paper navigation does not fire. `flex-shrink: 0` keeps the count visible when authors ellipsis. Count includes replies (`countThread` / `_comment_counts`). Desktop E2E: click → `/paper/TEST0002/discussion` → post → reply → like → `← Library` → `评论 · 2`.

No MEDIUM here. Do not restyle it.

### Mobile long-press — MEDIUM (see M4)

`PaperTitle` long-press is UA-gated (`prefersMobileViewer`), 480 ms, 10 px slop, `contextmenu` prevented, `navigate(discussionUrl)` then `click` preventDefault so the PDF does not open. E2E covers the last part (Playwright `mouse`, not a real touch + callout).

The *visible* mobile entry is still `评论 · N`. Long-press is an untaught second path that hijacks copy/select. Details under M4.

### Discussion navigation — MEDIUM (see M3)

`/paper/:id/discussion` is a shareable SPA route (server returns `spa_html()`). The bar is `← Library` + a dead `评论 · {total}`. The paper title is an `<h1>`, not a link. There is no Open PDF control. `PaperPage` has no discussion link either.

`← Library` is `<Link to="/">`, not history back and not the catalog query string. Returning works (E2E URL + refreshed count). Filters do not.

### Reply hierarchy — MEDIUM (see M2)

Server and UI agree: `MAX_REPLY_DEPTH = 1`; replies have 赞 and no 回复; `422 reply depth exceeded` if a client tries. Indent + left hairline (`.replies`). That is the right ceiling.

Reply *interaction* is a mode on the **top** composer: `回复一条评论` / 取消. It does not name the parent, highlight it, scroll to the form, or focus the textarea.

### Like interaction — LOW

`赞 · N` / `已赞 · N`. One tap, then disabled. `wepaper-liked-comments` in `localStorage` is the only client idempotency. Server always `like_count + 1`. Accidental likes cannot be undone; another browser can increment again.

Leave it. Unlike, hearts, and accounts would turn this into a network. Text like on an open-write thread is a mark, not a graph.

### Empty state — OK

Copy: `还没有评论。写下第一句讨论。` Composer is already above it. Screenshots (desktop and mobile) match: title, optional 署名, textarea, 发布, then the one muted line. No illustration, no “be the first to join.” Correct.

Empty `<ol class="thread">` stays in the DOM. Harmless. Empty state is hidden once any top-level comment exists (`comments.length === 0`).

### Long comments — LOW

`maxLength={2000}` matches `MAX_BODY`. `.comment-body` is `white-space: pre-wrap; overflow-wrap: anywhere`. Line breaks and long tokens survive. Bodies are React text, not HTML — keep that.

A 2000-character wall is tall and there is no collapse. For a nine-paper collection that is acceptable. Do not add “see more” previews unless a real thread forces it. No auto-linkify.

### Timestamps — LOW

`toLocaleString("zh-CN", { month, day, hour, minute })` — no year. Library dates are `en-GB` with year (`7 Sept 2026`). After twelve months, two Septembers collide. `<time dateTime>` is set. Add year later; do not switch to relative “3h ago.”

### Mobile keyboard — MEDIUM (see M1)

Not visible in the empty-state PNGs (keyboard closed). Inferred from layout + CSS:

- `index.html` viewport is `width=device-width, initial-scale=1` only — no `interactive-widget`.
- Body / inherited composer fields are **13 px**. iOS Safari zooms on focus below 16 px.
- Textarea is `rows={4}`, mobile `min-height: 5.5rem`, `resize: vertical`. 发布 is the next grid row, `justify-self: start`.
- Textarea Enter inserts a newline; it does not submit. User must tap 发布.
- No `visualViewport` inset, no sticky submit, no `scrollIntoView` on the button, no `enterkeyhint`.

### Returning to library — MEDIUM (folded into M3)

`← Library` lands on `/` and remounts the catalog, so `comment_count` refreshes (E2E). It also drops `q` / `sort` / `status`. Browser Back would keep them; the labeled control does not. Unposted composer text is discarded without a prompt — leave that (do not add a social “leave site?” dialog).

---

## MEDIUM findings

### [MEDIUM] M1 — Mobile composer is not keyboard-safe

**Evidence.** Composer is a top-of-page grid: 署名 (13 px `input` via `font: inherit`) → textarea (inherits 13 px from `body`) → 发布. Mobile textarea is 5.5 rem tall. Viewport meta does not request `interactive-widget=resizes-content`. 回复 does not focus the textarea (see M2), so the first mobile reply tap often does nothing visible; the second tap (into the field) opens the keyboard over 发布.

**Why it matters.** The mobile task is “write one note and send it.” A multiline field cannot submit with Enter. If 发布 sits under the software keyboard, and iOS has zoomed the 13 px field, posting takes dismiss + pinch + hunt. That is the main compose failure. Not verified with a real iOS keyboard in this review — layout makes it the default outcome.

**Fix (keep it small).** Make composer inputs `font-size: 16px` on coarse pointers. Keep 发布 in the visual viewport while the textarea is focused (scroll the button into view, or put the submit on the same row as the field). Do not add a GIF keyboard dock, emoji bar, or @mention typeahead.

### [MEDIUM] M2 — Reply is a remote, unnamed mode on the top composer

**Evidence.** `onReply` only `setReplyTo(id)`. Banner copy is the generic `回复一条评论`. No parent name, no highlight on `.comment`, no `focus()` / `scrollIntoView()` on the textarea. Replies render under the parent (good) but the act of replying happens at the top of the document. Switching 回复 targets is silent.

**Why it matters.** On a short empty page (the screenshots) this is invisible. As soon as the thread is longer than the viewport — the case mobile long-press is for — 回复 looks dead. Users will post a *new* top-level comment by mistake if they never notice the banner.

**Fix.** Keep one-level replies and the single composer. When 回复 is pressed: name the parent (`回复 匿名` / the display name), mark that comment, scroll to and focus the textarea. Cancel already exists. Do not add inline reply boxes under every comment, and do not add reply-to-reply.

### [MEDIUM] M3 — Discussion cannot open the paper; `← Library` hard-resets the catalog

**Evidence.** Discussion header:

```132:136:web/src/pages/DiscussionPage.tsx
        <Link className="mark" to="/">
          ← Library
        </Link>
        <span className="discuss-count">评论 · {total}</span>
```

Title is `<h1 class="discuss-title">` only. No `paperUrl` / `pdfUrl`. Library `评论 · N` and long-press both leave a catalog that may have `?q=&sort=&status=`. The back link ignores that. E2E only asserts `/(\?.*)?$`.

**Why it matters.** Comments are about a paper. A shared `/paper/:id/discussion` URL cannot reach the PDF without hunting the library. A filtered catalog → discussion → `← Library` drops the filter. Two different “I lost my place” failures, same missing attachment to the reading list.

**Fix.** Make the discussion title (or one text control) open `/paper/:id` the same way the catalog title does. Point `← Library` at `/?` + the search params the user came from, or `navigate(-1)` when history is in-app. Do not add a second toolbar or a “related papers” rail.

### [MEDIUM] M4 — Title long-press is untaught and steals system text actions

**Evidence.** Teaching is only `title={`${title} · 长按打开讨论`}` — unused on touch. `onContextMenu` is `preventDefault` on mobile UA. `is-longpress` paints the title accent **at fire time**, then navigates; there is no hold progress. `navigator.vibrate(12)` is a no-op in iOS Safari. Slop is 10 px. `评论 · N` remains the visible entry on the same row.

**Why it matters.** Long-press-to-copy a paper title is a normal catalog action. This build turns it into a route change. People who never discover the gesture still have `评论 · N` (so this is not a blocker). People who hold to copy get teleported. 10 px slop also makes a slightly shaky hold cancel, so the gesture is both surprising and flaky.

**Fix.** Keep long-press as a shortcut if you want it, but do not steal copy: allow the native callout, or require a clearer hold (larger slop, mid-hold ink, cancel on any context menu). Do not add a first-run coach mark or a hamburger of “Open discussion.” The visible `评论 · N` line is the real entry; it is fine that long-press stays secondary.

---

## LOW (do not escalate)

| Item | Note |
| --- | --- |
| Quiet `评论 · N` | Same gray as authors. Correct for a non-social catalog. |
| Like cannot undo / re-increments across browsers | Open write + localStorage. Do not add accounts. |
| Timestamps lack year; zh-CN vs library `en-GB` | Fine for v1.6 week one; add year later, not relative time. |
| Long comments have no collapse | `pre-wrap` + 2000 cap is enough until a real wall appears. |
| 署名 not remembered across visits | Optional; do not invent a profile. |
| Draft discarded on navigate | Prefer lost text over a leave-page dialog. |
| New comment not scrolled into view | Composer stays top; thread appends at bottom. |
| `评论 · N` accessible name is identical per row | Add the paper title to `aria-label` if you touch the link; do not change the visible string. |
| Like state flash | `useState(new Set())` then `loadLiked()` after mount. |
| Bilingual chrome (`Library` / `评论`) | Cosmetic. |
| E2E long-press uses `page.mouse` | Misses iOS callout / real touch. Product issue is M4, not the test. |
| No live refresh | Correct. This is not a chat. |
| Empty screenshots only | Replies/likes judged from code + desktop E2E. |

---

## Keep (not a defect)

- Per-paper route only. No site-wide discussion index.
- One-level replies, enforced in API and UI.
- Optional 署名, default 匿名.
- `评论 · 0` still opens the thread.
- Text 赞, not a heart.
- Composer-first empty state, one sentence.
- Thread count includes replies; library count matches after return.
- Long-press does not open the PDF (covered).
- Comment bodies as text, not HTML.

If a fix starts to look like a social network, stop. The MEDIUM list is attach the composer, attach the paper, survive the keyboard, and stop stealing copy.
