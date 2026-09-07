import type { ReadingStatus } from "./readingStatus";

export type Paper = {
  id: string;
  zotero_item_key: string;
  title: string;
  authors: string;
  year: number | null;
  venue: string | null;
  doi: string | null;
  tags: string[];
  collection: string;
  date_added: string | null;
  has_pdf: boolean;
  reading_status: ReadingStatus | null;
  abstract?: string;
};

const apiRoot = `${import.meta.env.BASE_URL}api/v1`;

function appBase(): string {
  return import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
}

export async function fetchPapers(
  q: string,
  sort: string,
  readingStatus = "all",
): Promise<{ papers: Paper[]; total: number }> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (sort) params.set("sort", sort);
  if (readingStatus && readingStatus !== "all") params.set("reading_status", readingStatus);
  params.set("limit", "100");
  const res = await fetch(`${apiRoot}/papers?${params}`, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Could not load the library");
  return res.json();
}

export async function fetchPaper(itemKey: string): Promise<Paper> {
  const res = await fetch(`${apiRoot}/papers/${itemKey}`, { credentials: "same-origin" });
  if (res.status === 404) throw new Error("Paper not found");
  if (!res.ok) throw new Error("Could not load the paper");
  return res.json();
}

export function paperUrl(itemKey: string): string {
  return `${appBase()}paper/${itemKey}`;
}

export function pdfUrl(itemKey: string): string {
  return `${appBase()}paper/${itemKey}/pdf`;
}

export async function fetchOwnerSession(): Promise<boolean> {
  const res = await fetch(`${apiRoot}/owner/session`, { credentials: "same-origin" });
  if (!res.ok) return false;
  const body = (await res.json()) as { owner?: boolean };
  return Boolean(body.owner);
}

export async function loginOwner(password: string): Promise<void> {
  const res = await fetch(`${apiRoot}/owner/login`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error("Could not sign in");
}

export async function logoutOwner(): Promise<void> {
  await fetch(`${apiRoot}/owner/logout`, { method: "POST", credentials: "same-origin" });
}

export async function patchPaperStatus(
  itemKey: string,
  readingStatus: ReadingStatus | null,
): Promise<Paper> {
  const res = await fetch(`${apiRoot}/papers/${itemKey}/status`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reading_status: readingStatus }),
  });
  if (!res.ok) throw new Error("Could not update reading status");
  return res.json();
}