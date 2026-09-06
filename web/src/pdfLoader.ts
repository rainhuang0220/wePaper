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
  rangeChunkSize: 1_048_576,
} as const;

const cache = new Map<string, Promise<pdfjs.PDFDocumentProxy>>();

export function loadPdf(url: string): Promise<pdfjs.PDFDocumentProxy> {
  const existing = cache.get(url);
  if (existing) return existing;
  const pending = pdfjs.getDocument({ url, ...SOURCE }).promise;
  cache.set(url, pending);
  pending.catch(() => {
    if (cache.get(url) === pending) cache.delete(url);
  });
  return pending;
}

export function warmPdf(url: string): void {
  void loadPdf(url);
}
