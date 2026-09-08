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
  comment_count: number;
  abstract?: string;
};

export type PaperComment = {
  id: string;
  paper_id: string;
  parent_id: string | null;
  body: string;
  display_name: string | null;
  like_count: number;
  created_at: string;
  replies: PaperComment[];
};

const apiRoot = `${import.meta.env.BASE_URL}api/v1`;

function appBase(): string {
  return import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
}

export async function fetchLibraryVersion(): Promise<string> {
  const res = await fetch(`${apiRoot}/library/version`, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Could not load library version");
  const body = (await res.json()) as { version: string };
  return body.version;
}

export async function fetchPapers(
  q: string,
  sort: string,
  readingStatus = "all",
): Promise<{ papers: Paper[]; total: number }> {
  const pageSize = 200;
  const papers: Paper[] = [];
  let total = 0;
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (sort) params.set("sort", sort);
    if (readingStatus && readingStatus !== "all") params.set("reading_status", readingStatus);
    params.set("limit", String(pageSize));
    params.set("offset", String(offset));
    const res = await fetch(`${apiRoot}/papers?${params}`, { credentials: "same-origin" });
    if (!res.ok) throw new Error("Could not load the library");
    const body = (await res.json()) as { papers: Paper[]; total: number };
    total = body.total;
    papers.push(...body.papers);
    if (papers.length >= total || body.papers.length === 0) break;
    offset += body.papers.length;
  }
  return { papers, total };
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

export function discussionUrl(itemKey: string): string {
  return `${appBase()}paper/${itemKey}/discussion`;
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

export async function fetchComments(itemKey: string): Promise<PaperComment[]> {
  const res = await fetch(`${apiRoot}/papers/${itemKey}/comments`, { credentials: "same-origin" });
  if (res.status === 404) throw new Error("Paper not found");
  if (!res.ok) throw new Error("Could not load comments");
  const body = (await res.json()) as { comments: PaperComment[] };
  return body.comments;
}

export async function postComment(
  itemKey: string,
  body: string,
  displayName?: string,
): Promise<PaperComment> {
  const res = await fetch(`${apiRoot}/papers/${itemKey}/comments`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, display_name: displayName || null }),
  });
  if (!res.ok) throw new Error("Could not post comment");
  return res.json();
}

export async function postReply(
  commentId: string,
  body: string,
  displayName?: string,
): Promise<PaperComment> {
  const res = await fetch(`${apiRoot}/comments/${commentId}/replies`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, display_name: displayName || null }),
  });
  if (!res.ok) throw new Error("Could not post reply");
  return res.json();
}

export async function likeComment(commentId: string): Promise<{ id: string; like_count: number }> {
  const res = await fetch(`${apiRoot}/comments/${commentId}/like`, {
    method: "POST",
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error("Could not like comment");
  return res.json();
}
