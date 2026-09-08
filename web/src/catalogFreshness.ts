export const VERSION_POLL_MS = 4000;

export function shouldRefetchCatalog(previous: string | null, next: string): boolean {
  return previous !== null && previous !== next;
}
