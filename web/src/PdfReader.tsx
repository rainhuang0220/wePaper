import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type Props = { url: string };

function typingTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

export function PdfReader({ url }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(1);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Loading the folio…");

  useEffect(() => {
    let cancelled = false;
    setPage(1);
    setQuery("");
    setStatus("Loading the folio…");
    setPdf(null);
    const task = pdfjs.getDocument({ url, withCredentials: false });
    task.promise
      .then((doc) => {
        if (cancelled) {
          void doc.destroy();
          return;
        }
        setPdf(doc);
        setPageCount(doc.numPages);
        setStatus("");
      })
      .catch(() => {
        if (!cancelled) setStatus("The PDF could not be opened.");
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [url]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const width = frame.clientWidth || 720;
      setFit(Math.max(0.35, (width - 24) / 612));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf) return;
    let gone = false;
    const safePage = Math.min(pageCount, Math.max(1, page));
    void pdf
      .getPage(safePage)
      .then(async (pdfPage) => {
        if (gone) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const width = frameRef.current?.clientWidth || base.width;
        const fitted = Math.max(0.35, ((width - 24) / base.width) * zoom);
        const viewport = pdfPage.getViewport({ scale: fitted });
        const canvas = canvasRef.current;
        const layer = textRef.current;
        if (!canvas || !layer) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext("2d");
        if (!context) return;
        await pdfPage.render({ canvasContext: context, viewport, canvas }).promise;
        if (gone) return;
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
          span.style.top = `${tx[5] - item.height * fitted}px`;
          span.style.fontSize = `${item.height * fitted}px`;
          if (query && item.str.toLowerCase().includes(query.toLowerCase())) {
            span.style.background = "rgba(127, 42, 36, 0.28)";
          }
          layer.appendChild(span);
        }
      })
      .catch(() => {
        if (!gone) setStatus("This page could not be drawn.");
      });
    return () => {
      gone = true;
    };
  }, [pdf, page, pageCount, zoom, query, fit]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (typingTarget(event)) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        setPage((value) => Math.min(pageCount, value + 1));
      }
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        setPage((value) => Math.max(1, value - 1));
      }
      if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(3, value + 0.15));
      if (event.key === "-" || event.key === "_") setZoom((value) => Math.max(0.6, value - 0.15));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageCount]);

  const haystackVisible = query.trim().length > 0;

  return (
    <>
      <div className="paper-bar toolbar-bar">
        <div className="toolbar" role="toolbar" aria-label="PDF controls">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            Prev
          </button>
          <input
            aria-label="Page"
            inputMode="numeric"
            value={page}
            onChange={(event) => setPage(Math.min(pageCount, Math.max(1, Number(event.target.value) || 1)))}
            style={{ width: 56 }}
          />
          <span className="meta">/ {pageCount}</span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          >
            Next
          </button>
          <button type="button" onClick={() => setZoom((value) => Math.max(0.6, value - 0.15))}>
            −
          </button>
          <button type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.15))}>
            +
          </button>
          <input
            type="search"
            placeholder="Find in page…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Find in page"
          />
        </div>
      </div>
      <div className="viewer" ref={frameRef}>
        {status ? <p className="status viewer-status">{status}</p> : null}
        <div className="page-wrap" data-query={haystackVisible ? query : undefined}>
          <canvas ref={canvasRef} />
          <div ref={textRef} className="textLayer" />
        </div>
      </div>
    </>
  );
}
