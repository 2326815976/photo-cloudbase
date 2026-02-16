export function normalizeAccessKey(input: unknown): string {
  return String(input ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/[\s\u00A0-]+/g, '')
    .toUpperCase();
}

