import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LibraryPage } from "./pages/LibraryPage";
import { OwnerPage } from "./pages/OwnerPage";
import "./styles.css";

const PaperPage = lazy(() => import("./pages/PaperPage").then((mod) => ({ default: mod.PaperPage })));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || undefined}>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/owner" element={<OwnerPage />} />
        <Route
          path="/paper/:id/viewer"
          element={
            <Suspense fallback={<p className="note">Opening…</p>}>
              <PaperPage />
            </Suspense>
          }
        />
        <Route
          path="/paper/:id"
          element={
            <Suspense fallback={<p className="note">Opening…</p>}>
              <PaperPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
