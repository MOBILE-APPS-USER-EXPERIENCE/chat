import { JsonKeyValueStore } from "../kv/jsonKeyValueStore";
import { MemoryStringBackend } from "../memory/memoryBackends";
import { MessageReactionsStore } from "../messageReactions";

test("reactions survive reopening, are scoped to account and chat, and toggle off", async () => {
  const kv = new JsonKeyValueStore(new MemoryStringBackend());
  const store = new MessageReactionsStore(kv);
  await Promise.all([
    store.toggle("a", 1, 10, "👍"),
    store.toggle("a", 2, 10, "❤️"),
    store.toggle("b", 1, 10, "😂"),
  ]);
  const reopened = new MessageReactionsStore(kv);
  expect(await reopened.list("a", 1)).toEqual({ 10: "👍" });
  expect(await reopened.list("a", 2)).toEqual({ 10: "❤️" });
  expect(await reopened.toggle("a", 1, 10, "❤️")).toEqual({ 10: "❤️" });
  expect(await reopened.toggle("a", 1, 10, "❤️")).toEqual({});
  await reopened.removeAccount("a");
  expect(await reopened.list("a", 2)).toEqual({});
  expect(await reopened.list("b", 1)).toEqual({ 10: "😂" });
});
