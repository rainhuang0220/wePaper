export function pageWindow(current: number, total: number, buffer = 2): number[] {
  if (total < 1) return [];
  const page = Math.min(total, Math.max(1, current));
  const start = Math.max(1, page - buffer);
  const end = Math.min(total, page + buffer);
  const pages: number[] = [];
  for (let i = start; i <= end; i += 1) pages.push(i);
  return pages;
}
