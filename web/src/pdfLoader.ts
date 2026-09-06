import * as pdfjs from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const SOURCE = {
  withCredentials: false,
  disableAutoFetch: true,
  disableStream: true,
  disableRange: false,
  rangeChunkSize: 131072,
} as const;

const memory = new Map<string, Promise<pdfjs.PDFDocumentProxy>>();
const CACHE = "wepaper-pdf-v12";

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
  return pdfjs.getDocument({ url, ...SOURCE }).promise;
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
