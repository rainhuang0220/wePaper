export const MAX_RANGE_BYTES = 262_144;

export function splitRange(begin: number, end: number): [number, number][] {
  const spans: [number, number][] = [];
  for (let cursor = begin; cursor < end; cursor += MAX_RANGE_BYTES) {
    spans.push([cursor, Math.min(cursor + MAX_RANGE_BYTES, end)]);
  }
  return spans;
}

export function parseTotalLength(contentRange: string | null, byteLength: number): number {
  const match = contentRange?.match(/\/(\d+)\s*$/);
  return match ? Number(match[1]) : byteLength;
}
