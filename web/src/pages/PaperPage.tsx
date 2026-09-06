import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchPaper, pdfUrl } from "../api";
import { PdfReader } from "../PdfReader";

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
  const [hasPdf, setHasPdf] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setTitle("");
    setHasPdf(null);
    setError("");
    fetchPaper(id)
      .then((next) => {
        setTitle(next.title);
        setHasPdf(next.has_pdf);
        setError("");
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);

  useEffect(() => {
    document.title = title ? `${title} · wePaper` : "wePaper";
    return () => {
      document.title = "wePaper";
    };
  }, [title]);

  if (error) return <Shell message="This paper is not available." />;
  if (hasPdf === false) return <Shell message="No PDF attached." />;
  if (!hasPdf) {
    return (
      <div className="paper-page">
        <div className="reader">
          <div className="reader-tools" role="toolbar" aria-label="PDF">
            <div className="tools-left">
              <Link className="back" to="/">
                Library
              </Link>
            </div>
            <div className="tools-center">
              <span className="find-count">Opening</span>
            </div>
            <div className="tools-right" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="paper-page">
      <PdfReader url={pdfUrl(id)} />
    </div>
  );
}
