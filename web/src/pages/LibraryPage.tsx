import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchPapers, type Paper } from "../api";

function publicTags(tags: string[]): string[] {
  return tags.filter((tag) => !tag.startsWith("/") && !/^#?wepaper:/.test(tag.toLowerCase()));
}

function addedLabel(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
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
    if (loading) return "Looking through the stacks…";
    if (query) return `${total} matching ${total === 1 ? "paper" : "papers"}`;
    return `${total} ${total === 1 ? "paper" : "papers"} in the library`;
  }, [loading, query, total]);

  return (
    <main className="shell">
      <header className="masthead">
        <div>
          <p className="wordmark">
            we<em>Paper</em>
          </p>
          <p className="lede">A quiet reading room for the papers kept in one Zotero collection.</p>
        </div>
        <div className="tools">
          <input
            type="search"
            placeholder="Search title, author, venue"
            value={query}
            onChange={(event) => updateParams({ q: event.target.value })}
            aria-label="Search papers"
          />
          <select value={sort} onChange={(event) => updateParams({ sort: event.target.value })} aria-label="Sort">
            <option value="added">Added</option>
            <option value="year">Year</option>
            <option value="title">Title</option>
          </select>
        </div>
      </header>
      <p className="census">{census}</p>
      {error ? <p className="status">{error}</p> : null}
      {!loading && papers.length === 0 ? (
        <div className="empty">
          <h2>The shelf is empty</h2>
          <p>Nothing has been published to this library yet.</p>
        </div>
      ) : (
        <ol className="catalog">
          {papers.map((paper) => (
            <li key={paper.zotero_item_key}>
              <Link className="entry" to={`/paper/${paper.zotero_item_key}`}>
                <h2 className="title">{paper.title}</h2>
                <p className="byline">{paper.authors || "Unknown authors"}</p>
                <p className="meta">
                  {[paper.year, paper.venue, addedLabel(paper.date_added)].filter(Boolean).join(" · ")}
                </p>
                {publicTags(paper.tags).length ? (
                  <div className="chips">
                    {publicTags(paper.tags)
                      .slice(0, 6)
                      .map((tag) => (
                      <span className="chip" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </Link>
            </li>
          ))}
        </ol>
      )}
      <p className="footer-note">
        Papers appear here only after a private sync from the operator’s Zotero library. The operator is
        responsible for what is published. Do not assume every PDF is free to redistribute.
      </p>
    </main>
  );
}
