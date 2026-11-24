import { formatMessageSelection } from "./format-message-selection";

describe("formatting a selected part of a draft", () => {
  it("wraps only the selected words and keeps them selected", () => {
    expect(formatMessageSelection("Das ist wichtig!", { start: 7, end: 15 }, "bold"))
      .toEqual({ text: "Das ist **wichtig**!", selection: { start: 10, end: 17 } });
  });

  it("combines bold and italic and removes only the chosen format on a second press", () => {
    const bold = formatMessageSelection("Wort", { start: 0, end: 4 }, "bold")!;
    const both = formatMessageSelection(bold.text, bold.selection, "italic")!;
    expect(both.text).toBe("***Wort***");
    expect(formatMessageSelection(both.text, both.selection, "bold"))
      .toEqual({ text: "*Wort*", selection: { start: 1, end: 5 } });
  });

  it("supports italic within a word and inline code that contains backticks", () => {
    expect(formatMessageSelection("Teilwort", { start: 4, end: 8 }, "italic")?.text)
      .toBe("Teil*wort*");
    expect(formatMessageSelection("`x`", { start: 0, end: 3 }, "code"))
      .toEqual({ text: "`` `x` ``", selection: { start: 3, end: 6 } });
  });

  it("leaves a whitespace-only selection untouched", () => {
    expect(formatMessageSelection("Hallo Welt", { start: 5, end: 6 }, "bold")).toBeUndefined();
  });
});
