import { messageLinkUrl, parseMessageMarkdown } from "./message-markdown";

describe("message Markdown", () => {
  it("parses nested emphasis, lists, code, and links", () => {
    const message = [
      "**fett und *kursiv*** neben `code`",
      "",
      "- [Campus](https://example.org/campus)",
      "  1. Eintrag",
      "",
      "```ts",
      "const count = 3;",
      "```",
    ].join("\n");

    const tokens = parseMessageMarkdown(message).filter(({ type }) => type !== "space");
    expect(tokens).toMatchObject([
      {
        type: "paragraph",
        tokens: [
          { type: "strong", tokens: [{ type: "text" }, { type: "em", text: "kursiv" }] },
          { type: "text" },
          { type: "codespan", text: "code" },
        ],
      },
      {
        type: "list",
        items: [{ tokens: [
          { type: "text", tokens: [{ type: "link", href: "https://example.org/campus" }] },
          { type: "list", start: 1 },
        ] }],
      },
      { type: "code", text: "const count = 3;" },
    ]);
  });

  it("retains incomplete syntax and leaves HTML in a raw token", () => {
    expect([...parseMessageMarkdown("**offen [Link](\n\n<script>code</script>")]).toMatchObject([
      { type: "paragraph", tokens: [{ type: "text", text: "**offen [Link](" }] },
      { type: "space" },
      { type: "html", raw: "<script>code</script>" },
    ]);
  });
});

describe("message links", () => {
  it("accepts absolute HTTP and HTTPS links", () => {
    expect(messageLinkUrl("https://example.org/seite?q=1#abschnitt"))
      .toBe("https://example.org/seite?q=1#abschnitt");
    expect(messageLinkUrl("HTTP://example.org")).toBe("http://example.org/");
  });

  it.each([
    "javascript:alert(1)",
    "java&#x73;cript:alert(1)",
    "data:text/html,test",
    "chat://invite/1",
    "//example.org",
    "/chat/1",
    "https:///example.org",
    "https://name@example.org",
    "https://exam\tple.org",
    "https://[invalid",
  ])("leaves %s as text", (url) => {
    expect(messageLinkUrl(url)).toBeUndefined();
  });
});
