import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnnotationEditorType, AnnotationMode } from "pdfjs-dist";
import {
  EventBus,
  FindState,
  PDFFindController,
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

export function MobilePaperViewer({ url, title }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const pdfViewerRef = useRef<PDFViewer | null>(null);
  const eventBusRef = useRef<EventBus | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [query, setQuery] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [findCount, setFindCount] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
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
      eventBus.off("pagechanging", onPage);
      eventBus.off("pagesinit", onPagesInit);
      eventBus.off("updatefindmatchescount", onFindCount);
      eventBus.off("updatefindcontrolstate", onFindCount);
      window.clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      findController.setDocument(null as never);
      linkService.setDocument(null, null);
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
        setMenuOpen(false);
        window.setTimeout(() => findRef.current?.focus(), 0);
        return;
      }
      if (event.key === "Escape") {
        if (findOpen) {
          setFindOpen(false);
          setQuery("");
          setFindCount("");
          eventBusRef.current?.dispatch("findbarclose", { source: window });
        }
        setMenuOpen(false);
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
      if (event.key === "0") viewer.currentScaleValue = "page-width";
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
        <Link className="back" to="/">
          ← Library
        </Link>
        {findOpen ? (
          <div className="mobile-find">
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
            <span className="find-count">{findCount}</span>
          </div>
        ) : (
          <span className="paper-title">{title || "wePaper"}</span>
        )}
        <span className="page-readout" aria-live="polite">
          {page}/{pages}
        </span>
        <div className="reader-more">
          <button
            type="button"
            aria-label="More actions"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            ⋯
          </button>
          {menuOpen ? (
            <div className="reader-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                aria-label="Find in document"
                onClick={() => {
                  setMenuOpen(false);
                  setFindOpen(true);
                  window.setTimeout(() => findRef.current?.focus(), 0);
                }}
              >
                Search
              </button>
              <button
                type="button"
                role="menuitem"
                aria-label="Zoom in"
                onClick={() => {
                  pdfViewerRef.current?.increaseScale({ steps: 1 });
                  setMenuOpen(false);
                }}
              >
                Zoom in
              </button>
              <button
                type="button"
                role="menuitem"
                aria-label="Zoom out"
                onClick={() => {
                  pdfViewerRef.current?.decreaseScale({ steps: 1 });
                  setMenuOpen(false);
                }}
              >
                Zoom out
              </button>
              <a className="open-pdf" href={url} role="menuitem" aria-label="Open PDF">
                Open PDF
              </a>
              <a className="open-pdf" href={url} download role="menuitem">
                Download PDF
              </a>
            </div>
          ) : null}
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
