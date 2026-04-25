export function normalizeOptionalAuthText(value: unknown): string | null {
  const text = String(value == null ? '' : value).trim();
  if (!text) {
    return null;
  }

  const normalized = text.toLowerCase();
  if (normalized === 'null' || normalized === 'undefined' || normalized === 'nil' || normalized === 'none') {
    return null;
  }

  return text;
}
