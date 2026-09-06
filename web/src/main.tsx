import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LibraryPage } from "./pages/LibraryPage";
import { PaperPage } from "./pages/PaperPage";
import "./styles.css";

const workerHref = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
if (typeof document !== "undefined" && !document.querySelector(`link[href="${workerHref}"]`)) {
  const preload = document.createElement("link");
  preload.rel = "modulepreload";
  preload.href = workerHref;
  document.head.appendChild(preload);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || undefined}>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/paper/:id" element={<PaperPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
