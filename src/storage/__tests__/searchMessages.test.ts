import { msg, snap } from "../../messaging/__tests__/fakes";
import { MemoryAccountStorageFactory } from "../memory";
import { searchMessages } from "../searchMessages";

test("finds text and tags across storage pages without duplicates or results from other chats", async () => {
  const storage = await new MemoryAccountStorageFactory().open("account");
  await storage.chats.applySnapshot([snap(1), snap(2), snap(3)], 0);
  await storage.messages.appendBatch(1, [
    { ...msg(1), text: "Die Nächste\n   Prüfung", sentAt: null },
    { ...msg(2), text: null, sentAt: null },
    { ...msg(3), text: "Nächste Prüfung", sentAt: null },
    ...Array.from({ length: 103 }, (_, index) => ({ ...msg(index + 4), text: "Weiterer Verlauf" })),
  ], 10);
  await storage.messages.appendBatch(2, [{ ...msg(1), text: "Nächste Prüfung", sentAt: null }], 20);
  await storage.messages.appendBatch(3, [{ ...msg(1), text: "Nächste Prüfung" }], 30);
  const scope = (await storage.chats.list()).filter(({ id }) => id !== 3);
  const tags = { 1: { 2: ["Nächste Prüfung"], 3: ["Nächste Prüfung"] } };

  const hits = await searchMessages(storage.messages, scope, tags, "  NA\u0308CHSTE PRÜF ");
  expect(hits.map(({ chat, message }) => [chat.id, message.id])).toEqual([[2, 1], [1, 3], [1, 2], [1, 1]]);
  await expect(searchMessages(storage.messages, [scope[0]], tags, " ")).resolves.toEqual([]);
});
