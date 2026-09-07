import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchPaper, pdfUrl } from "../api";
import { MobilePaperViewer } from "../MobilePaperViewer";

export { prefetchPdfRuntime } from "../pdfLoader";

function Shell({ message }: { message: string }) {
  return (
    <div className="lib">
      <header className="lib-bar">
        <Link className="mark" to="/">
          Library
        </Link>
      </header>
      <p className="note">{message}</p>
    </div>
  );
}

export function PaperPage() {
  const { id = "" } = useParams();
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setTitle("");
    setError("");
    fetchPaper(id)
      .then((next) => {
        setTitle(next.title);
        if (!next.has_pdf) setError("No PDF attached.");
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);

  useEffect(() => {
    document.title = title ? `${title} · wePaper` : "wePaper";
    return () => {
      document.title = "wePaper";
    };
  }, [title]);

  if (error) return <Shell message={error === "Paper not found" ? "This paper is not available." : error} />;

  return (
    <div className="paper-page">
      <MobilePaperViewer url={pdfUrl(id)} title={title} />
    </div>
  );
}
