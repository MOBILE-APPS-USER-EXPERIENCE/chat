export function normalizeSearchText(value: string) {
  return value.normalize("NFC").toLocaleLowerCase("de").replace(/\s+/g, " ").trim();
}

export function splitSearchMatches(value: string, query: string) {
  const text = value.normalize("NFC");
  const words = query.normalize("NFC").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [{ text, match: false }];

  const pattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const segments = [];
  let end = 0;
  for (const match of text.matchAll(new RegExp(pattern, "giu"))) {
    if (match.index > end) segments.push({ text: text.slice(end, match.index), match: false });
    segments.push({ text: match[0], match: true });
    end = match.index + match[0].length;
  }
  if (end < text.length) segments.push({ text: text.slice(end), match: false });
  return segments;
}
