import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import * as pdfjs from "pdfjs-dist";
import { findPageHits, nextHit, prevHit } from "./findHits";
import { pageWindow } from "./pdfWindow";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type Props = { url: string };
type PageSize = { width: number; height: number };

function typingTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

function Icon({ path, label }: { path: string; label: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <title>{label}</title>
      <path fill="currentColor" d={path} />
    </svg>
  );
}

export function PdfReader({ url }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [pageCount, setPageCount] = useState(1);
  const [current, setCurrent] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(false);
  const [query, setQuery] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [pageTexts, setPageTexts] = useState<string[]>([]);
  const [status, setStatus] = useState("Opening");
  const [widths, setWidths] = useState(720);
  const findRef = useRef<HTMLInputElement>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => {
    let cancelled = false;
    setPdf(null);
    setSizes([]);
    setPageTexts([]);
    setCurrent(1);
    setStatus("Opening");
    const task = pdfjs.getDocument({ url, withCredentials: false });
    task.promise
      .then(async (doc) => {
        const first = await doc.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        const measured: PageSize[] = Array.from({ length: doc.numPages }, () => ({
          width: viewport.width,
          height: viewport.height,
        }));
        if (cancelled) {
          void doc.destroy();
          return;
        }
        setSizes(measured);
        setPdf(doc);
        setPageCount(doc.numPages);
        setStatus("");
        const hash = window.location.hash.match(/page=(\d+)/i);
        if (hash) setCurrent(Math.min(doc.numPages, Math.max(1, Number(hash[1]))));
        for (let index = 2; index <= doc.numPages; index += 1) {
          const page = await doc.getPage(index);
          const next = page.getViewport({ scale: 1 });
          measured[index - 1] = { width: next.width, height: next.height };
          if (cancelled) {
            void doc.destroy();
            return;
          }
        }
        if (!cancelled) setSizes([...measured]);
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
    if (!pdf) return;
    let cancelled = false;
    void (async () => {
      const texts: string[] = [];
      for (let index = 1; index <= pdf.numPages; index += 1) {
        const page = await pdf.getPage(index);
        const content = await page.getTextContent();
        texts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
        if (cancelled) return;
      }
      if (!cancelled) setPageTexts(texts);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const measure = () => setWidths(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!sizes[0] || !widths) return;
    if (sizes[0].width > widths - 48) setFitWidth(true);
  }, [sizes, widths]);

  const hits = useMemo(() => findPageHits(pageTexts, query), [pageTexts, query]);
  const renderSet = useMemo(() => new Set(pageWindow(current, pageCount, 2)), [current, pageCount]);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || !pdf) return;
    const onScroll = () => {
      const probe = root.scrollTop + Math.min(72, root.clientHeight * 0.16);
      let found = 1;
      for (const [page, el] of pageEls.current) {
        if (el.offsetTop <= probe) found = Math.max(found, page);
      }
      setCurrent((prev) => (prev === found ? prev : found));
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => root.removeEventListener("scroll", onScroll);
  }, [pdf, pageCount, sizes, zoom, fitWidth, widths]);

  useEffect(() => {
    if (!pdf || !sizes.length) return;
    const wanted = current;
    const el = pageEls.current.get(wanted);
    if (!el) return;
    const root = scrollerRef.current;
    if (!root) return;
    const visible =
      el.offsetTop < root.scrollTop + root.clientHeight && el.offsetTop + el.offsetHeight > root.scrollTop;
    if (!visible) el.scrollIntoView({ block: "start" });
  }, [pdf, sizes]);

  function goTo(page: number) {
    const next = Math.min(pageCount, Math.max(1, page));
    setCurrent(next);
    pageEls.current.get(next)?.scrollIntoView({ block: "start" });
  }

  function jumpHit(direction: 1 | -1) {
    const page = direction === 1 ? nextHit(hits, current) : prevHit(hits, current);
    if (page) goTo(page);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setFindOpen(true);
        window.setTimeout(() => findRef.current?.focus(), 0);
        return;
      }
      if (event.key === "Escape" && findOpen) {
        setFindOpen(false);
        setQuery("");
        return;
      }
      if (typingTarget(event)) {
        if (event.key === "Enter" && findOpen) {
          event.preventDefault();
          jumpHit(event.shiftKey ? -1 : 1);
        }
        return;
      }
      if (event.key === "+" || event.key === "=") {
        setFitWidth(false);
        setZoom((value) => Math.min(3, value + 0.1));
      }
      if (event.key === "-" || event.key === "_") {
        setFitWidth(false);
        setZoom((value) => Math.max(0.4, value - 0.1));
      }
      if (event.key === "0") {
        setFitWidth(false);
        setZoom(1);
      }
      if (event.key === "Home") goTo(1);
      if (event.key === "End") goTo(pageCount);
      if (event.key === "j" || event.key === "ArrowRight") goTo(current + 1);
      if (event.key === "k" || event.key === "ArrowLeft") goTo(current - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function bumpZoom(delta: number) {
    setFitWidth(false);
    setZoom((value) => Math.min(3, Math.max(0.4, Math.round((value + delta) * 10) / 10)));
  }

  const zoomLabel = fitWidth ? "Fit" : `${Math.round(zoom * 100)}%`;

  return (
    <div className="reader">
      <div className="reader-tools" role="toolbar" aria-label="PDF">
        <div className="tools-left">
          <Link className="back" to="/">
            Library
          </Link>
        </div>
        <div className="tools-center">
          {findOpen ? (
            <>
              <input
                ref={findRef}
                className="findbar-input"
                type="search"
                placeholder="Find"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Find in document"
              />
              <button type="button" onClick={() => jumpHit(-1)} aria-label="Previous match">
                <Icon label="Previous" path="M8 3 3 8l5 5 .7-.7L4.4 8 8.7 3.7z" />
              </button>
              <button type="button" onClick={() => jumpHit(1)} aria-label="Next match">
                <Icon label="Next" path="M8 3l5 5-5 5-.7-.7L11.6 8 7.3 3.7z" />
              </button>
              <span className="find-count">
                {query.trim() ? (hits.length ? `${hits.length}` : "0") : ""}
              </span>
            </>
          ) : (
            <span className="page-readout">
              <input
                aria-label="Page"
                inputMode="numeric"
                value={current}
                onChange={(event) => goTo(Number(event.target.value) || 1)}
              />
              <span>/ {pageCount}</span>
            </span>
          )}
        </div>
        <div className="tools-right">
          <button type="button" onClick={() => bumpZoom(-0.1)} aria-label="Zoom out">
            <Icon label="Zoom out" path="M3 7.5h10v1H3z" />
          </button>
          <button
            type="button"
            className="zoom-label"
            onClick={() => {
              if (fitWidth) {
                setFitWidth(false);
                setZoom(1);
              } else {
                setFitWidth(true);
              }
            }}
            aria-label={fitWidth ? "Actual size" : "Fit width"}
          >
            {zoomLabel}
          </button>
          <button type="button" onClick={() => bumpZoom(0.1)} aria-label="Zoom in">
            <Icon label="Zoom in" path="M7.5 3v4.5H3v1h4.5V13h1V8.5H13v-1H8.5V3z" />
          </button>
          <button
            type="button"
            aria-pressed={findOpen}
            onClick={() => {
              setFindOpen((value) => !value);
              window.setTimeout(() => findRef.current?.focus(), 0);
            }}
            aria-label="Find in document"
          >
            <Icon
              label="Find"
              path="M10.6 9.7 14 13.1l-.9.9-3.4-3.4a4.5 4.5 0 1 1 .9-.9zM6.5 3a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"
            />
          </button>
          <a className="open-pdf" href={url} target="_blank" rel="noreferrer" aria-label="Open PDF">
            <Icon
              label="Open PDF"
              path="M4 1.5h5.2L12.5 4.8V14a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V2A.5.5 0 0 1 4 1.5zm5 .7v2.6h2.6L9 2.2z"
            />
          </a>
        </div>
      </div>
      <div className="reader-scroll" ref={scrollerRef}>
        {status ? <p className="reader-status">{status}</p> : null}
        {pdf
          ? sizes.map((size, index) => {
              const page = index + 1;
              const scale = fitWidth ? Math.max(0.2, (widths - 144) / size.width) : zoom;
              const css = { width: size.width * scale, height: size.height * scale };
              return (
                <PdfPage
                  key={`${url}-${page}`}
                  pdf={pdf}
                  page={page}
                  scale={scale}
                  css={css}
                  active={renderSet.has(page)}
                  query={query}
                  register={(el) => {
                    if (el) pageEls.current.set(page, el);
                    else pageEls.current.delete(page);
                  }}
                />
              );
            })
          : null}
      </div>
    </div>
  );
}

function PdfPage({
  pdf,
  page,
  scale,
  css,
  active,
  query,
  register,
}: {
  pdf: pdfjs.PDFDocumentProxy;
  page: number;
  scale: number;
  css: { width: number; height: number };
  active: boolean;
  query: string;
  register: (el: HTMLDivElement | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    let gone = false;
    let renderTask: pdfjs.RenderTask | undefined;
    let textLayer: pdfjs.TextLayer | undefined;
    void pdf.getPage(page).then(async (pdfPage) => {
      if (gone) return;
      const viewport = pdfPage.getViewport({ scale });
      const canvas = canvasRef.current;
      const layer = textRef.current;
      if (!canvas || !layer) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      renderTask = pdfPage.render({ canvasContext: context, viewport, canvas });
      try {
        await renderTask.promise;
      } catch {
        return;
      }
      if (gone) return;
      layer.replaceChildren();
      layer.style.width = `${viewport.width}px`;
      layer.style.height = `${viewport.height}px`;
      layer.style.setProperty("--total-scale-factor", String(scale));
      textLayer = new pdfjs.TextLayer({
        textContentSource: pdfPage.streamTextContent(),
        container: layer,
        viewport,
      });
      await textLayer.render();
      if (gone) return;
      const needle = query.trim().toLowerCase();
      if (needle) {
        for (const node of textLayer.textDivs) {
          if (node.textContent?.toLowerCase().includes(needle)) node.classList.add("highlight");
        }
      }
    });
    return () => {
      gone = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, page, scale, active, query]);

  return (
    <div
      className="pdf-page"
      data-page={page}
      data-testid={`pdf-page-${page}`}
      ref={register}
      style={
        {
          width: css.width,
          minHeight: css.height,
          "--total-scale-factor": String(scale),
        } as CSSProperties
      }
    >
      {active ? (
        <>
          <canvas ref={canvasRef} />
          <div ref={textRef} className="textLayer" />
        </>
      ) : (
        <div className="pdf-placeholder" style={{ height: css.height }} />
      )}
    </div>
  );
}
