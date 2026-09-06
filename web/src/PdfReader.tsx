import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type Props = { url: string };

export function PdfReader({ url }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [scale, setScale] = useState(1.15);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Loading the folio…");

  useEffect(() => {
    let cancelled = false;
    const task = pdfjs.getDocument({ url, withCredentials: false });
    task.promise
      .then((doc) => {
        if (cancelled) return;
        setPdf(doc);
        setPageCount(doc.numPages);
        setStatus("");
      })
      .catch(() => setStatus("The PDF could not be opened."));
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [url]);

  useEffect(() => {
    if (!pdf) return;
    let gone = false;
    void pdf.getPage(page).then(async (pdfPage) => {
      if (gone) return;
      const viewport = pdfPage.getViewport({ scale });
      const canvas = canvasRef.current;
      const layer = textRef.current;
      if (!canvas || !layer) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (!context) return;
      await pdfPage.render({ canvasContext: context, viewport, canvas }).promise;
      const text = await pdfPage.getTextContent();
      layer.innerHTML = "";
      layer.style.width = `${viewport.width}px`;
      layer.style.height = `${viewport.height}px`;
      for (const item of text.items) {
        if (!("str" in item) || !item.str) continue;
        const span = document.createElement("span");
        const tx = pdfjs.Util.transform(viewport.transform, item.transform);
        span.textContent = item.str;
        span.style.left = `${tx[4]}px`;
        span.style.top = `${tx[5] - item.height * scale}px`;
        span.style.fontSize = `${item.height * scale}px`;
        if (query && item.str.toLowerCase().includes(query.toLowerCase())) {
          span.style.background = "rgba(127, 42, 36, 0.28)";
        }
        layer.appendChild(span);
      }
    });
    return () => {
      gone = true;
    };
  }, [pdf, page, scale, query]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        setPage((value) => Math.min(pageCount, value + 1));
      }
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        setPage((value) => Math.max(1, value - 1));
      }
      if (event.key === "+" || event.key === "=") setScale((value) => Math.min(3, value + 0.15));
      if (event.key === "-" || event.key === "_") setScale((value) => Math.max(0.6, value - 0.15));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageCount]);

  const haystackVisible = query.trim().length > 0;

  return (
    <>
      <div className="paper-bar" style={{ borderTop: "1px solid var(--rule)" }}>
        <div className="toolbar" role="toolbar" aria-label="PDF controls">
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>
            Prev
          </button>
          <input
            aria-label="Page"
            value={page}
            onChange={(event) => setPage(Math.min(pageCount, Math.max(1, Number(event.target.value) || 1)))}
            style={{ width: 56 }}
          />
          <span className="meta">/ {pageCount}</span>
          <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
            Next
          </button>
          <button type="button" onClick={() => setScale((value) => Math.max(0.6, value - 0.15))}>
            −
          </button>
          <button type="button" onClick={() => setScale((value) => Math.min(3, value + 0.15))}>
            +
          </button>
          <input
            type="search"
            placeholder="Find in page"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Find in page"
          />
        </div>
      </div>
      <div className="viewer">
        {status ? <p className="status">{status}</p> : null}
        <div className="page-wrap" data-query={haystackVisible ? query : undefined}>
          <canvas ref={canvasRef} />
          <div ref={textRef} className="textLayer" />
        </div>
      </div>
    </>
  );
}
