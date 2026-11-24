export type MessageSelection = { start: number; end: number };
export type MessageFormat = "bold" | "italic" | "code";

export function formatMessageSelection(
  text: string,
  selection: MessageSelection,
  format: MessageFormat,
): { text: string; selection: MessageSelection } | undefined {
  const selected = text.slice(selection.start, selection.end);
  const content = selected.trim();
  if (!content || (format === "code" && content.includes("\n"))) return undefined;

  const start = selection.start + selected.length - selected.trimStart().length;
  const end = start + content.length;
  const before = text.slice(0, start);
  const after = text.slice(end);
  let open: string;
  let close: string;

  if (format === "code") {
    const longestRun = (content.match(/`+/g) ?? [])
      .reduce((longest, run) => Math.max(longest, run.length), 0);
    const fence = "`".repeat(longestRun + 1);
    const needsPadding = content.startsWith("`") || content.endsWith("`");
    open = needsPadding ? `${fence} ` : fence;
    close = needsPadding ? ` ${fence}` : fence;
  } else {
    open = close = format === "bold" ? "**" : "*";
  }

  const leadingStars = before.match(/\*+$/)?.[0].length ?? 0;
  const trailingStars = after.match(/^\*+/)?.[0].length ?? 0;
  const alreadyFormatted = format === "code"
    ? before.endsWith(open) && after.startsWith(close)
    : leadingStars === trailingStars && (leadingStars === 3 || leadingStars === open.length);

  if (alreadyFormatted) {
    const nextStart = start - open.length;
    return {
      text: before.slice(0, -open.length) + content + after.slice(close.length),
      selection: { start: nextStart, end: nextStart + content.length },
    };
  }

  return {
    text: before + open + content + close + after,
    selection: { start: start + open.length, end: end + open.length },
  };
}
