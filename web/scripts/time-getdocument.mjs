import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  import.meta.url,
).toString();

const url = process.argv[2];
const stream = process.argv.includes("--stream");
const t0 = Date.now();
const doc = await pdfjs.getDocument({
  url,
  disableAutoFetch: true,
  disableStream: !stream,
  disableRange: false,
  rangeChunkSize: 131072,
}).promise;
const opened = Date.now() - t0;
const page = await doc.getPage(1);
const paged = Date.now() - t0;
console.log(JSON.stringify({ url, stream, pages: doc.numPages, opened, paged }));
await doc.destroy();
