import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { discussionUrl, fetchLibraryVersion, fetchPapers, paperUrl, patchPaperStatus, type Paper } from "../api";
import { VERSION_POLL_MS, shouldRefetchCatalog } from "../catalogFreshness";
import { prefersMobileViewer } from "../device";
import { FILTERS, type ReadingStatus } from "../readingStatus";
import { StatusChip } from "../StatusChip";

const LONG_PRESS_MS = 480;
const HOLD_HINT_MS = 160;
const LONG_PRESS_SLOP = 18;

function addedLabel(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function shortAuthors(authors: string): string {
  const names = authors.split(",").map((part) => part.trim()).filter(Boolean);
  if (names.length <= 4) return names.join(", ");
  return `${names.slice(0, 4).join(", ")} et al.`;
}

function secondLine(paper: Paper): string {
  const authors = shortAuthors(paper.authors || "Unknown authors");
  return paper.year ? `${authors} · ${paper.year}` : authors;
}

function DocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 1.5h5.2L12.5 4.8V14a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V2A.5.5 0 0 1 4 1.5zm5 .7v2.6h2.6L9 2.2z"
      />
    </svg>
  );
}

export function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const sort = params.get("sort") || "added";
  const statusFilter = params.get("status") || "all";
  const [papers, setPapers] = useState<Paper[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const filtersRef = useRef({ query, sort, statusFilter });
  filtersRef.current = { query, sort, statusFilter };
  const versionRef = useRef<string | null>(null);
  const catalogGen = useRef(0);

  function applyCatalog(data: { papers: Paper[]; total: number }) {
    setPapers(data.papers);
    setTotal(data.total);
    setError("");
  }

  useEffect(() => {
    let cancelled = false;
    const gen = ++catalogGen.current;
    const handle = window.setTimeout(() => {
      setLoading(true);
      fetchPapers(query, sort, statusFilter)
        .then((data) => {
          if (!cancelled && gen === catalogGen.current) applyCatalog(data);
        })
        .catch((err: Error) => {
          if (!cancelled && gen === catalogGen.current) setError(err.message);
        })
        .finally(() => {
          if (!cancelled && gen === catalogGen.current) setLoading(false);
        });
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, sort, statusFilter]);

  useEffect(() => {
    let cancelled = false;

    async function check(force = false) {
      try {
        const next = await fetchLibraryVersion();
        if (cancelled) return;
        const previous = versionRef.current;
        versionRef.current = next;
        if (!force && !shouldRefetchCatalog(previous, next)) return;
        if (previous === null && !force) return;
        const filters = filtersRef.current;
        const gen = ++catalogGen.current;
        const data = await fetchPapers(filters.query, filters.sort, filters.statusFilter);
        const latest = filtersRef.current;
        if (
          !cancelled &&
          gen === catalogGen.current &&
          latest.query === filters.query &&
          latest.sort === filters.sort &&
          latest.statusFilter === filters.statusFilter
        ) {
          applyCatalog(data);
        }
      } catch {
        /* keep the last good catalog */
      }
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void check(false);
    }, VERSION_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void check(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    void check(false);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, []);

  function updateParams(next: { q?: string; sort?: string; status?: string }) {
    const merged = new URLSearchParams(params);
    const q = next.q ?? query;
    const nextSort = next.sort ?? sort;
    const nextStatus = next.status ?? statusFilter;
    if (q) merged.set("q", q);
    else merged.delete("q");
    if (nextSort && nextSort !== "added") merged.set("sort", nextSort);
    else merged.delete("sort");
    if (nextStatus && nextStatus !== "all") merged.set("status", nextStatus);
    else merged.delete("status");
    setParams(merged, { replace: true });
  }

  const census = useMemo(() => `${total}`, [total]);

  function changeStatus(key: string, readingStatus: ReadingStatus | null) {
    const previous = papers;
    setPapers((current) =>
      current.map((paper) => (paper.zotero_item_key === key ? { ...paper, reading_status: readingStatus } : paper)),
    );
    void patchPaperStatus(key, readingStatus).catch(() => {
      setPapers(previous);
      setError("Could not update reading status");
    });
  }

  return (
    <div className="lib">
      <header className="lib-bar">
        <Link className="mark" to="/">
          wePaper
        </Link>
        <input
          className="lib-search"
          type="search"
          placeholder="Search"
          value={query}
          onChange={(event) => updateParams({ q: event.target.value })}
          aria-label="Search papers"
        />
        <label className="status-filter">
          <span className="sr-only">Filter by reading status</span>
          <select
            aria-label="Filter by reading status"
            value={statusFilter}
            onChange={(event) => updateParams({ status: event.target.value })}
          >
            {FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
        <nav className="sorts" aria-label="Sort">
          {(
            [
              ["added", "Added"],
              ["year", "Year"],
              ["title", "Title"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={sort === value ? "on" : undefined}
              onClick={() => updateParams({ sort: value })}
            >
              {label}
            </button>
          ))}
        </nav>
        <span className="count">{census}</span>
      </header>
      {error ? (
        <p className="note" role="alert">
          {error}
        </p>
      ) : loading && papers.length === 0 ? (
        <ol className="rows" aria-busy="true" aria-label="Loading papers">
          {Array.from({ length: 8 }, (_, index) => (
            <li key={index} className="row-skel" />
          ))}
        </ol>
      ) : papers.length === 0 ? (
        <p className="note">{query || statusFilter !== "all" ? "No matching papers." : "No papers published yet."}</p>
      ) : (
        <ol className="rows">
          {papers.map((paper) => (
            <li key={paper.zotero_item_key} className="row">
              <span className="gutter" aria-hidden="true">
                {paper.has_pdf ? <DocIcon /> : null}
              </span>
              <div className="row-main">
                <PaperTitle paper={paper} />
                <div className="row-meta">
                  <StatusChip
                    value={paper.reading_status}
                    onChange={(next) => changeStatus(paper.zotero_item_key, next)}
                  />
                  <p className="authors">{secondLine(paper)}</p>
                  <Link
                    className="comment-count"
                    to={discussionUrl(paper.zotero_item_key)}
                    state={{ fromSearch: params.toString() }}
                    aria-label={`${paper.title} 评论 · ${paper.comment_count}`}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    评论 · {paper.comment_count}
                  </Link>
                </div>
              </div>
              <time>{addedLabel(paper.date_added)}</time>
            </li>
          ))}
        </ol>
      )}
      <footer className="colophon">Published from a private Zotero collection.</footer>
    </div>
  );
}

function PaperTitle({ paper }: { paper: Paper }) {
  const navigate = useNavigate();
  const title = paper.venue ? `${paper.title} — ${paper.venue}` : paper.title;
  const timer = useRef(0);
  const hintTimer = useRef(0);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  const [pressed, setPressed] = useState(false);

  function clearTimer() {
    window.clearTimeout(timer.current);
    window.clearTimeout(hintTimer.current);
    timer.current = 0;
    hintTimer.current = 0;
    setPressed(false);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLAnchorElement>) {
    if (!prefersMobileViewer()) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    longPressed.current = false;
    origin.current = { x: event.clientX, y: event.clientY };
    clearTimer();
    hintTimer.current = window.setTimeout(() => setPressed(true), HOLD_HINT_MS);
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      setPressed(true);
      if (navigator.vibrate) navigator.vibrate(12);
      navigate(discussionUrl(paper.zotero_item_key), { state: { fromSearch: window.location.search.replace(/^\?/, "") } });
    }, LONG_PRESS_MS);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLAnchorElement>) {
    if (!origin.current || !timer.current) return;
    const dx = event.clientX - origin.current.x;
    const dy = event.clientY - origin.current.y;
    if (dx * dx + dy * dy > LONG_PRESS_SLOP * LONG_PRESS_SLOP) clearTimer();
  }

  function finishPointer(event: ReactPointerEvent<HTMLAnchorElement>) {
    window.clearTimeout(timer.current);
    window.clearTimeout(hintTimer.current);
    timer.current = 0;
    hintTimer.current = 0;
    origin.current = null;
    if (longPressed.current) {
      event.preventDefault();
    } else {
      setPressed(false);
    }
  }

  return (
    <a
      className={`row-open${pressed ? " is-longpress" : ""}`}
      href={paperUrl(paper.zotero_item_key)}
      title={prefersMobileViewer() ? `${title} · 长按打开讨论` : title}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onContextMenu={(event) => {
        if (prefersMobileViewer()) event.preventDefault();
      }}
      onClick={(event) => {
        if (longPressed.current) {
          event.preventDefault();
          event.stopPropagation();
          longPressed.current = false;
          setPressed(false);
        }
      }}
    >
      <h2>{paper.title}</h2>
    </a>
  );
}
