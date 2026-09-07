import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnnotationEditorType, AnnotationMode } from "pdfjs-dist";
import {
  EventBus,
  FindState,
  PDFFindController,
  PDFHistory,
  PDFLinkService,
  PDFViewer,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import { loadPdf, persistPdf } from "./pdfLoader";

type Props = { url: string; title?: string };

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

export function PaperViewer({ url, title }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const pdfViewerRef = useRef<PDFViewer | null>(null);
  const eventBusRef = useRef<EventBus | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [scaleLabel, setScaleLabel] = useState("Fit");
  const [query, setQuery] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [findCount, setFindCount] = useState("");
  const [firstReady, setFirstReady] = useState(false);
  const [status, setStatus] = useState("Opening");

  useEffect(() => {
    const container = containerRef.current;
    const viewer = viewerRef.current;
    if (!container || !viewer) return;
    let cancelled = false;
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });
    const findController = new PDFFindController({ eventBus, linkService });
    const history = new PDFHistory({ eventBus, linkService });
    const pdfViewer = new PDFViewer({
      container,
      viewer,
      eventBus,
      linkService,
      findController,
      textLayerMode: 1,
      annotationMode: AnnotationMode.ENABLE,
      annotationEditorMode: AnnotationEditorType.NONE,
      removePageBorders: true,
      enableDetailCanvas: true,
    });
    linkService.setViewer(pdfViewer);
    history.initialize({ fingerprint: url, resetHistory: true });
    pdfViewerRef.current = pdfViewer;
    eventBusRef.current = eventBus;

    const markFirstReady = (ev: { pageNumber: number }) => {
      if (cancelled || ev.pageNumber !== 1) return;
      const canvas = container.querySelector('.page[data-page-number="1"] canvas');
      if (canvas instanceof HTMLCanvasElement && canvas.width > 0) {
        setFirstReady(true);
        setStatus("");
      }
    };
    const onScale = () => {
      const value = pdfViewer.currentScaleValue;
      setScaleLabel(value === "page-width" ? "Fit" : `${Math.round(pdfViewer.currentScale * 100)}%`);
    };
    const onPage = () => setPage(pdfViewer.currentPageNumber);
    const onPagesInit = () => {
      pdfViewer.currentScaleValue = "page-width";
      setPages(pdfViewer.pagesCount || 1);
    };
    const onFindCount = (ev: { matchesCount?: { current?: number; total?: number }; state?: number }) => {
      if (ev.state === FindState.PENDING) return;
      const total = ev.matchesCount?.total ?? 0;
      setFindCount(total ? String(total) : "0");
    };
    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (cancelled || !pdfViewer.pdfDocument) return;
        const mode = pdfViewer.currentScaleValue;
        if (mode === "page-width" || mode === "page-fit" || mode === "auto") {
          pdfViewer.currentScaleValue = mode;
        } else {
          pdfViewer.update();
        }
      }, 80);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);
    eventBus.on("pagerendered", markFirstReady);
    eventBus.on("scalechanging", onScale);
    eventBus.on("pagechanging", onPage);
    eventBus.on("pagesinit", onPagesInit);
    eventBus.on("updatefindmatchescount", onFindCount);
    eventBus.on("updatefindcontrolstate", onFindCount);

    setFirstReady(false);
    setFindCount("");
    setStatus("Opening");
    void loadPdf(url)
      .then((doc) => {
        if (cancelled) return;
        pdfViewer.setDocument(doc);
        linkService.setDocument(doc, null);
        findController.setDocument(doc);
        setPages(doc.numPages);
      })
      .catch(() => {
        if (!cancelled) setStatus("The PDF could not be opened.");
      });

    return () => {
      cancelled = true;
      eventBus.off("pagerendered", markFirstReady);
      eventBus.off("scalechanging", onScale);
      eventBus.off("pagechanging", onPage);
      eventBus.off("pagesinit", onPagesInit);
      eventBus.off("updatefindmatchescount", onFindCount);
      eventBus.off("updatefindcontrolstate", onFindCount);
      window.clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      findController.setDocument(null as never);
      linkService.setDocument(null, null);
      history.reset();
      pdfViewer.cleanup();
      pdfViewerRef.current = null;
      eventBusRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    if (!firstReady) return;
    void loadPdf(url).then((doc) => persistPdf(url, doc));
  }, [firstReady, url]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const viewer = pdfViewerRef.current;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setFindOpen(true);
        window.setTimeout(() => findRef.current?.focus(), 0);
        return;
      }
      if (event.key === "Escape" && findOpen) {
        setFindOpen(false);
        setQuery("");
        setFindCount("");
        eventBusRef.current?.dispatch("findbarclose", { source: window });
        return;
      }
      if (typingTarget(event)) {
        if (event.key === "Enter" && findOpen) {
          event.preventDefault();
          dispatchFind(true, event.shiftKey);
        }
        return;
      }
      if (!viewer) return;
      if (event.key === "+" || event.key === "=") viewer.increaseScale({ steps: 1 });
      if (event.key === "-" || event.key === "_") viewer.decreaseScale({ steps: 1 });
      if (event.key === "0") viewer.currentScaleValue = "1";
      if (event.key === "Home") viewer.currentPageNumber = 1;
      if (event.key === "End") viewer.currentPageNumber = viewer.pagesCount;
      if (event.key === "j" || event.key === "ArrowRight") viewer.currentPageNumber += 1;
      if (event.key === "k" || event.key === "ArrowLeft") viewer.currentPageNumber -= 1;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function dispatchFind(again: boolean, previous = false) {
    const needle = query.trim();
    if (!needle) {
      setFindCount("");
      return;
    }
    eventBusRef.current?.dispatch("find", {
      source: window,
      type: again ? "again" : "",
      query: needle,
      highlightAll: true,
      caseSensitive: false,
      entireWord: false,
      findPrevious: previous,
      matchDiacritics: false,
    });
  }

  return (
    <div className="reader">
      <div className="reader-tools" role="toolbar" aria-label="PDF">
        <div className="tools-left">
          <Link className="back" to="/">
            Library
          </Link>
          {title ? <span className="paper-title">{title}</span> : null}
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
                aria-label="Find"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setFindCount("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    dispatchFind(true, event.shiftKey);
                  }
                }}
              />
              <button type="button" aria-label="Previous match" onClick={() => dispatchFind(true, true)}>
                <Icon label="Previous" path="M8 3 3 8l5 5 .7-.7L4.4 8 8.7 3.7z" />
              </button>
              <button type="button" aria-label="Next match" onClick={() => dispatchFind(true, false)}>
                <Icon label="Next" path="M8 3l5 5-5 5-.7-.7L11.6 8 7.3 3.7z" />
              </button>
              <span className="find-count">{findCount}</span>
            </>
          ) : (
            <span className="page-readout">
              <input
                aria-label="Page"
                inputMode="numeric"
                value={page}
                onChange={(event) => {
                  const next = Number(event.target.value) || 1;
                  if (pdfViewerRef.current) pdfViewerRef.current.currentPageNumber = next;
                }}
              />
              <span>/ {pages}</span>
            </span>
          )}
        </div>
        <div className="tools-right">
          <button type="button" aria-label="Zoom out" onClick={() => pdfViewerRef.current?.decreaseScale({ steps: 1 })}>
            <Icon label="Zoom out" path="M3 7.5h10v1H3z" />
          </button>
          <button
            type="button"
            className="zoom-label"
            aria-label={scaleLabel === "Fit" ? "Actual size" : "Fit width"}
            onClick={() => {
              const viewer = pdfViewerRef.current;
              if (!viewer) return;
              viewer.currentScaleValue = viewer.currentScaleValue === "page-width" ? "1" : "page-width";
            }}
          >
            {scaleLabel}
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => pdfViewerRef.current?.increaseScale({ steps: 1 })}>
            <Icon label="Zoom in" path="M7.5 3v4.5H3v1h4.5V13h1V8.5H13v-1H8.5V3z" />
          </button>
          <button
            type="button"
            aria-pressed={findOpen}
            aria-label="Find in document"
            onClick={() => {
              setFindOpen((open) => {
                const next = !open;
                if (!next) {
                  setQuery("");
                  setFindCount("");
                  eventBusRef.current?.dispatch("findbarclose", { source: window });
                } else {
                  window.setTimeout(() => findRef.current?.focus(), 0);
                }
                return next;
              });
            }}
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
      <div className="reader-stage">
        {status ? <p className="reader-status">{status}</p> : null}
        <div
          className="reader-scroll"
          ref={containerRef}
          style={{ position: "absolute" }}
          data-first-ready={firstReady ? "true" : "false"}
        >
          <div className="pdfViewer" ref={viewerRef} />
        </div>
      </div>
    </div>
  );
}
