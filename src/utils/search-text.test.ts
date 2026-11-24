import { splitSearchMatches } from "./search-text";

test("marks literal, case-insensitive matches while preserving line breaks", () => {
  expect(splitSearchMatches("Die Nächste\nAufgabe: C++. Danach c++.", "c++")).toEqual([
    { text: "Die Nächste\nAufgabe: ", match: false },
    { text: "C++", match: true },
    { text: ". Danach ", match: false },
    { text: "c++", match: true },
    { text: ".", match: false },
  ]);
  expect(splitSearchMatches("Nächste\nAufgabe", "NA\u0308CHSTE Aufgabe")).toEqual([
    { text: "Nächste\nAufgabe", match: true },
  ]);
});
