import { lexer, type MarkedToken, type Token } from "marked";

type WebUrl = `http://${string}` | `https://${string}`;

export function messageLinkUrl(value: string): WebUrl | undefined {
  if (!/^https?:\/\/[^/\\]/i.test(value) || /[\\\u0000-\u0020\u007f]/.test(value)) {
    return undefined;
  }

  try {
    const url = new URL(value);
    const { protocol, host, username, password, pathname, search, hash } = url;
    if (host && !username && !password && (protocol === "https:" || protocol === "http:")) {
      return `${protocol}//${host}${pathname}${search}${hash}`;
    }
  } catch {
    // The renderer leaves invalid destinations as plain message text.
    return undefined;
  }
}

export function parseMessageMarkdown(text: string): Token[] {
  try {
    // Read the built-in Markdown tokens without generating HTML.
    return lexer(text, { gfm: false });
  } catch {
    const fallback: MarkedToken = { type: "text", raw: text, text };
    return [fallback];
  }
}
