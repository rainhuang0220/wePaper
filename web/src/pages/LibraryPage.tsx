import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchPapers, type Paper } from "../api";

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
  const [papers, setPapers] = useState<Paper[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setLoading(true);
      fetchPapers(query, sort)
        .then((data) => {
          setPapers(data.papers);
          setTotal(data.total);
          setError("");
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false));
    }, 160);
    return () => window.clearTimeout(handle);
  }, [query, sort]);

  function updateParams(next: { q?: string; sort?: string }) {
    const merged = new URLSearchParams(params);
    const q = next.q ?? query;
    const nextSort = next.sort ?? sort;
    if (q) merged.set("q", q);
    else merged.delete("q");
    if (nextSort && nextSort !== "added") merged.set("sort", nextSort);
    else merged.delete("sort");
    setParams(merged, { replace: true });
  }

  const census = useMemo(() => {
    if (loading && papers.length === 0) return "";
    if (query) return `${total}`;
    return `${total}`;
  }, [loading, papers.length, query, total]);

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
        <p className="note">{query ? "No matching papers." : "No papers published yet."}</p>
      ) : (
        <ol className="rows">
          {papers.map((paper) => (
            <li key={paper.zotero_item_key}>
              <Link
                className="row"
                to={`/paper/${paper.zotero_item_key}`}
                title={paper.venue ? `${paper.title} — ${paper.venue}` : paper.title}
              >
                <span className="gutter" aria-hidden="true">
                  {paper.has_pdf ? <DocIcon /> : null}
                </span>
                <span className="row-main">
                  <h2>{paper.title}</h2>
                  <p className="authors">{secondLine(paper)}</p>
                </span>
                <time>{addedLabel(paper.date_added)}</time>
              </Link>
            </li>
          ))}
        </ol>
      )}
      <footer className="colophon">Published from a private Zotero collection.</footer>
    </div>
  );
}
