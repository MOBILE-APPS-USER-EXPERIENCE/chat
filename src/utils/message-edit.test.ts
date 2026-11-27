/** @jest-environment node */

import type { OutboxRow, RawMessage } from "../storage/types";
import {
  applyMessageEdits,
  buildEditText,
  canEditMessage,
  displayText,
  isEditChange,
  isEditMessageText,
  parseEditText,
  pendingEditsByTarget,
} from "./message-edit";

function message(patch: Partial<RawMessage> = {}): RawMessage {
  return {
    id: 1,
    chatId: 7,
    userid: "abcdit01",
    userNick: null,
    userFullname: null,
    userHash: null,
    serverTime: null,
    sentAt: 1,
    receivedAt: 1,
    important: false,
    text: "Hallo",
    photoId: null,
    fileId: null,
    position: null,
    ...patch,
  };
}

function row(patch: Partial<OutboxRow> = {}): OutboxRow {
  return {
    chatId: 7,
    text: "x",
    important: false,
    photoUri: null,
    fileUri: null,
    position: null,
    clientMessageId: "c1",
    status: "pending",
    attempts: 0,
    nextRetryAt: null,
    lastError: null,
    createdAt: 1,
    ...patch,
  };
}

describe("edit format", () => {
  it("builds and parses an edit", () => {
    const text = buildEditText(42, "  Neuer Text ");
    expect(text).toBe("[edit:42] Neuer Text");
    expect(parseEditText(text)).toEqual({ targetId: 42, text: "Neuer Text" });
  });

  it("keeps line breaks in the new text", () => {
    expect(parseEditText("[edit:3] a\nb")?.text).toBe("a\nb");
  });

  it("ignores normal text and broken edits", () => {
    expect(parseEditText("Hallo")).toBeNull();
    expect(parseEditText(null)).toBeNull();
    expect(parseEditText("[edit:abc] x")).toBeNull();
    expect(parseEditText("[edit:4]x")).toBeNull();
    expect(parseEditText("[edit:4]    ")).toBeNull();
    expect(parseEditText(" [edit:4] x")).toBeNull();
  });

  it("recognizes every text in edit format, also broken ones", () => {
    expect(isEditMessageText("[edit:4]    ")).toBe(true);
    expect(isEditMessageText("Hallo [edit:4] x")).toBe(false);
  });
});

describe("applyMessageEdits", () => {
  it("hides the edit and shows the new text on the original", () => {
    const result = applyMessageEdits([
      message({ id: 1, text: "Hallo Wlet" }),
      message({ id: 2, text: "[edit:1] Hallo Welt" }),
    ]);
    expect(result.messages.map((m) => [m.id, m.text])).toEqual([[1, "Hallo Welt"]]);
    expect([...result.editedIds]).toEqual([1]);
  });

  it("uses the newest edit when there are several", () => {
    const result = applyMessageEdits([
      message({ id: 1, text: "a" }),
      message({ id: 5, text: "[edit:1] c" }),
      message({ id: 3, text: "[edit:1] b" }),
    ]);
    expect(result.messages[0].text).toBe("c");
  });

  it("ignores edits from another author but still hides them", () => {
    const result = applyMessageEdits([
      message({ id: 1, userid: "abcdit01", text: "Original" }),
      message({ id: 2, userid: "zzzzit99", text: "[edit:1] Gefälscht" }),
    ]);
    expect(result.messages.map((m) => m.text)).toEqual(["Original"]);
    expect(result.editedIds.size).toBe(0);
  });

  it("compares authors case-insensitively", () => {
    const result = applyMessageEdits([
      message({ id: 1, userid: "ABCDIT01", text: "a" }),
      message({ id: 2, userid: "abcdit01", text: "[edit:1] b" }),
    ]);
    expect(result.messages[0].text).toBe("b");
  });

  it("ignores edits that are older than the original or point at unknown messages", () => {
    const result = applyMessageEdits([
      message({ id: 1, text: "[edit:5] zu früh" }),
      message({ id: 5, text: "Original" }),
      message({ id: 6, text: "[edit:99] unbekannt" }),
    ]);
    expect(result.messages.map((m) => [m.id, m.text])).toEqual([[5, "Original"]]);
    expect(result.editedIds.size).toBe(0);
  });

  it("does not let an edit target another edit", () => {
    const result = applyMessageEdits([
      message({ id: 1, text: "a" }),
      message({ id: 2, text: "[edit:1] b" }),
      message({ id: 3, text: "[edit:2] c" }),
    ]);
    expect(result.messages.map((m) => m.text)).toEqual(["b"]);
  });

  it("keeps the order of the remaining messages", () => {
    const result = applyMessageEdits([
      message({ id: 3, text: "drei" }),
      message({ id: 2, text: "[edit:1] eins!" }),
      message({ id: 1, text: "eins" }),
    ]);
    expect(result.messages.map((m) => m.id)).toEqual([3, 1]);
  });
});

describe("pendingEditsByTarget", () => {
  it("returns the newest pending edit per original and ignores normal rows", () => {
    const result = pendingEditsByTarget([
      row({ clientMessageId: "a", text: "[edit:1] alt", createdAt: 1 }),
      row({ clientMessageId: "b", text: "[edit:1] neu", createdAt: 2, status: "failed" }),
      row({ clientMessageId: "c", text: "normal", createdAt: 3 }),
    ]);
    expect([...result.keys()]).toEqual([1]);
    expect(result.get(1)?.editText).toBe("neu");
    expect(result.get(1)?.status).toBe("failed");
  });
});

describe("canEditMessage", () => {
  it("allows own text messages only", () => {
    expect(canEditMessage(message(), "ABCDIT01")).toBe(true);
    expect(canEditMessage(message({ userid: "other" }), "abcdit01")).toBe(false);
    expect(canEditMessage(message({ text: null, photoId: "p" }), "abcdit01")).toBe(false);
    expect(canEditMessage(message({ fileId: "f" }), "abcdit01")).toBe(false);
    expect(canEditMessage(message({ text: "[edit:1] x" }), "abcdit01")).toBe(false);
  });
});

describe("isEditChange and displayText", () => {
  it("requires a changed, non-empty text", () => {
    expect(isEditChange("Hallo", "Hallo ")).toBe(false);
    expect(isEditChange("Hallo", "  ")).toBe(false);
    expect(isEditChange("Hallo", "Hallo Welt")).toBe(true);
  });

  it("shows the new text of an edit in previews", () => {
    expect(displayText("[edit:1] Neu")).toBe("Neu");
    expect(displayText("Hallo")).toBe("Hallo");
    expect(displayText(null)).toBeNull();
  });
});
