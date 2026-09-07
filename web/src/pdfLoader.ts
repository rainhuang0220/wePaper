import * as pdfjs from "pdfjs-dist";
import { MAX_RANGE_BYTES, parseTotalLength, splitRange } from "./pdfRange";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export function prefetchPdfRuntime(): void {
  if (typeof document === "undefined") return;
  const href = pdfjs.GlobalWorkerOptions.workerSrc;
  if (!href || document.querySelector("link[data-wepaper-worker]")) return;
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "script";
  link.crossOrigin = "anonymous";
  link.href = href;
  link.dataset.wepaperWorker = "1";
  document.head.appendChild(link);
}

const memory = new Map<string, Promise<pdfjs.PDFDocumentProxy>>();
const CACHE = "wepaper-pdf-v12";
const FETCH_CONCURRENCY = 2;

export function loadPdf(url: string): Promise<pdfjs.PDFDocumentProxy> {
  const existing = memory.get(url);
  if (existing) return existing;
  const pending = openPdf(url);
  memory.set(url, pending);
  pending.catch(() => {
    if (memory.get(url) === pending) memory.delete(url);
  });
  return pending;
}

export function warmPdf(url: string): void {
  void loadPdf(url);
}

export async function persistPdf(url: string, doc: pdfjs.PDFDocumentProxy): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(CACHE);
    if (await cache.match(url)) return;
    const data = await doc.getData();
    const copy = Uint8Array.from(data);
    await cache.put(url, new Response(new Blob([copy], { type: "application/pdf" })));
  } catch {
    /* private mode or incomplete fetch */
  }
}

async function openPdf(url: string): Promise<pdfjs.PDFDocumentProxy> {
  const cached = await readCachedPdf(url);
  if (cached) return pdfjs.getDocument({ data: cached }).promise;

  const first = await fetchByteRange(url, 0, MAX_RANGE_BYTES);
  if (first.bytes.byteLength >= first.total) {
    return pdfjs.getDocument({ data: first.bytes }).promise;
  }

  const transport = new FetchRangeTransport(url, first.total, Uint8Array.from(first.bytes));
  return pdfjs.getDocument({
    range: transport,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: false,
  }).promise;
}

async function readCachedPdf(url: string): Promise<ArrayBuffer | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (!hit) return null;
    const data = await hit.arrayBuffer();
    return data.byteLength > 8 ? data : null;
  } catch {
    return null;
  }
}

class FetchRangeTransport extends pdfjs.PDFDataRangeTransport {
  #url: string;
  #aborted = false;

  constructor(url: string, length: number, initial: Uint8Array) {
    super(length, initial);
    this.#url = url;
  }

  requestDataRange(begin: number, end: number): void {
    void fetchByteRange(this.#url, begin, end).then((part) => {
      if (!this.#aborted) this.onDataRange(begin, part.bytes);
    });
  }

  abort(): void {
    this.#aborted = true;
    super.abort();
  }
}

async function fetchByteRange(
  url: string,
  begin: number,
  end: number,
): Promise<{ bytes: Uint8Array; total: number }> {
  const spans = splitRange(begin, end);
  const parts: { bytes: Uint8Array; total: number }[] = [];
  for (let index = 0; index < spans.length; index += FETCH_CONCURRENCY) {
    const batch = spans.slice(index, index + FETCH_CONCURRENCY);
    parts.push(...(await Promise.all(batch.map(([from, to]) => fetchSpan(url, from, to)))));
  }
  if (parts.length === 1) return parts[0];
  const bytes = new Uint8Array(end - begin);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part.bytes, offset);
    offset += part.bytes.byteLength;
  }
  return { bytes, total: parts[0].total };
}

async function fetchSpan(url: string, begin: number, end: number): Promise<{ bytes: Uint8Array; total: number }> {
  const response = await fetch(url, {
    headers: { Range: `bytes=${begin}-${end - 1}` },
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { bytes, total: parseTotalLength(response.headers.get("content-range"), bytes.byteLength) };
}
