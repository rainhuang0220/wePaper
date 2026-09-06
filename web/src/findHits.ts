export function findPageHits(pages: string[], query: string): number[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: number[] = [];
  pages.forEach((text, index) => {
    if (text.toLowerCase().includes(needle)) hits.push(index + 1);
  });
  return hits;
}

export function nextHit(hits: number[], current: number): number | null {
  if (!hits.length) return null;
  return hits.find((page) => page > current) ?? hits[0];
}

export function prevHit(hits: number[], current: number): number | null {
  if (!hits.length) return null;
  const earlier = [...hits].reverse().find((page) => page < current);
  return earlier ?? hits[hits.length - 1];
}
