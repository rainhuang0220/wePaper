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
  abstract?: string;
};

const apiRoot = `${import.meta.env.BASE_URL}api/v1`;

export async function fetchPapers(q: string, sort: string): Promise<{ papers: Paper[]; total: number }> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (sort) params.set("sort", sort);
  params.set("limit", "100");
  const res = await fetch(`${apiRoot}/papers?${params}`);
  if (!res.ok) throw new Error("Could not load the library");
  return res.json();
}

export async function fetchPaper(id: string): Promise<Paper> {
  const res = await fetch(`${apiRoot}/papers/${id}`);
  if (!res.ok) throw new Error("Paper not found");
  return res.json();
}

export function pdfUrl(itemKey: string): string {
  return `${apiRoot}/papers/${itemKey}/pdf`;
}
