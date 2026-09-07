import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchOwnerSession, fetchPapers, paperUrl, patchPaperStatus, type Paper } from "../api";
import { prefersMobileViewer } from "../device";
import { FILTERS, type ReadingStatus } from "../readingStatus";
import { StatusChip } from "../StatusChip";

if (prefersMobileViewer()) {
  void import("./PaperPage").then((mod) => {
    mod.prefetchPdfRuntime();
  });
}

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
  const [owner, setOwner] = useState(false);

  useEffect(() => {
    void fetchOwnerSession().then(setOwner);
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setLoading(true);
      fetchPapers(query, sort, statusFilter)
        .then((data) => {
          setPapers(data.papers);
          setTotal(data.total);
          setError("");
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false));
    }, 160);
    return () => window.clearTimeout(handle);
  }, [query, sort, statusFilter]);

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
                    owner={owner}
                    onChange={(next) => changeStatus(paper.zotero_item_key, next)}
                    onFilter={(next) => updateParams({ status: next })}
                  />
                  <p className="authors">{secondLine(paper)}</p>
                </div>
              </div>
              <time>{addedLabel(paper.date_added)}</time>
            </li>
          ))}
        </ol>
      )}
      <footer className="colophon">
        Published from a private Zotero collection.{" "}
        <Link to="/owner">{owner ? "Owner signed in" : "Owner"}</Link>
      </footer>
    </div>
  );
}

function PaperTitle({ paper }: { paper: Paper }) {
  const title = paper.venue ? `${paper.title} — ${paper.venue}` : paper.title;
  if (prefersMobileViewer()) {
    return (
      <Link className="row-open" to={`/paper/${paper.zotero_item_key}`} title={title}>
        <h2>{paper.title}</h2>
      </Link>
    );
  }
  return (
    <a className="row-open" href={paperUrl(paper.zotero_item_key)} title={title}>
      <h2>{paper.title}</h2>
    </a>
  );
}
