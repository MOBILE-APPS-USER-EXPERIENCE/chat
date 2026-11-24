import { parseMessageMarkdown } from "./message-markdown";
import { isHorizontalSwipe, replyText, swipeOffset } from "./message-reply";

describe("message interaction", () => {
  it("accepts swipes in both horizontal directions and rejects vertical or short movement", () => {
    expect(isHorizontalSwipe(60, 4)).toBe(true);
    expect(isHorizontalSwipe(-60, 4)).toBe(true);
    expect(isHorizontalSwipe(20, 60)).toBe(false);
    expect(isHorizontalSwipe(5, 1)).toBe(false);
    expect(swipeOffset(-100)).toBe(-72);
    expect(swipeOffset(100)).toBe(72);
  });

  it("sends an ordinary message unchanged and formats a reply as a Markdown quote", () => {
    expect(replyText("Danke!", null)).toBe("Danke!");
    const reply = replyText("Danke!", { author: "Alex", text: "**Vorlage**\nnächste Zeile" });
    expect(reply).toBe("> Alex · \\*\\*Vorlage\\*\\* nächste Zeile\n\nDanke!");
    expect(parseMessageMarkdown(reply).map(({ type }) => type)).toEqual(["blockquote", "space", "paragraph"]);
  });
});
