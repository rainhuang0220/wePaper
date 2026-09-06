import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchPaper, pdfUrl, type Paper } from "../api";
import { PdfReader } from "../PdfReader";

function shortAuthors(authors: string): string {
  const names = authors.split(",").map((part) => part.trim()).filter(Boolean);
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} et al.`;
}

export function PaperPage() {
  const { id = "" } = useParams();
  const [paper, setPaper] = useState<Paper | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setPaper(null);
    setError("");
    fetchPaper(id)
      .then((next) => {
        setError("");
        setPaper(next);
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);

  useEffect(() => {
    document.title = paper ? `${paper.title} · wePaper` : "wePaper";
    return () => {
      document.title = "wePaper";
    };
  }, [paper]);

  if (error) {
    return (
      <main className="shell">
        <Link className="back" to="/">
          ← Library
        </Link>
        <div className="empty">
          <h2>This paper is not on the shelf</h2>
          <p>{error}</p>
        </div>
      </main>
    );
  }
  if (!paper) {
    return (
      <main className="shell">
        <Link className="back" to="/">
          ← Library
        </Link>
        <p className="status">Opening the folio…</p>
      </main>
    );
  }

  return (
    <div className="paper-page">
      <header className="paper-bar">
        <div>
          <Link className="back" to="/">
            ← Library
          </Link>
          <h1>{paper.title}</h1>
          <p className="byline">{shortAuthors(paper.authors)}</p>
          <p className="meta">{[paper.year, paper.venue, paper.doi].filter(Boolean).join(" · ")}</p>
        </div>
      </header>
      {paper.has_pdf ? (
        <PdfReader url={pdfUrl(paper.zotero_item_key)} />
      ) : (
        <div className="empty">
          <h2>No PDF yet</h2>
          <p>Metadata synced, but the attachment has not arrived.</p>
        </div>
      )}
    </div>
  );
}
