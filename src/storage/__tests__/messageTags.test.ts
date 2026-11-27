import { JsonKeyValueStore } from "../kv/jsonKeyValueStore";
import { MemoryStringBackend } from "../memory/memoryBackends";
import { MessageTagsStore } from "../messageTags";

describe("local message tags", () => {
  it("loads the complete tag index for one account", async () => {
    const store = new MessageTagsStore(new JsonKeyValueStore(new MemoryStringBackend()));
    await store.set("alice", 1, 4, ["Projekt A", "Projektnotizen"]);
    await store.set("alice", 2, 4, ["PROJEKT B"]);
    await store.set("bob", 1, 9, ["Projekt C"]);

    expect(await store.listAll("alice")).toEqual({
      1: { 4: ["Projekt A", "Projektnotizen"] },
      2: { 4: ["PROJEKT B"] },
    });
  });

  it("stores multiple distinct tags per message and isolates accounts and chats", async () => {
    const kv = new JsonKeyValueStore(new MemoryStringBackend());
    const store = new MessageTagsStore(kv);

    await Promise.all([
      store.set("alice", 1, 1, [" Projekt A ", "Dokumentation", "Projekt A", ""]),
      store.set("alice", 1, 2, ["Prüfung"]),
      store.set("alice", 2, 1, ["Anderer Chat"]),
      store.set("bob", 1, 1, ["Eigener Tag"]),
    ]);

    const reopened = new MessageTagsStore(kv);
    expect(await reopened.list("alice", 1)).toEqual({ 1: ["Projekt A", "Dokumentation"], 2: ["Prüfung"] });
    expect(await reopened.list("alice", 2)).toEqual({ 1: ["Anderer Chat"] });
    expect(await reopened.list("bob", 1)).toEqual({ 1: ["Eigener Tag"] });
    await reopened.set("alice", 1, 1, []);
    expect(await reopened.list("alice", 1)).toEqual({ 2: ["Prüfung"] });

    await reopened.removeAccount("alice");
    expect(await reopened.list("alice", 2)).toEqual({});
    expect(await reopened.list("bob", 1)).toEqual({ 1: ["Eigener Tag"] });
  });
});
