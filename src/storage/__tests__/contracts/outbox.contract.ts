import type { AccountStorage } from "../../ports";
import type { OutboxInput } from "../../types";

export function outboxRepositoryContract(
  name: string,
  make: () => Promise<AccountStorage>,
) {
  describe(`OutboxRepository (${name})`, () => {
    let storage: AccountStorage;

    const input = (chatId: number, text = "hi"): OutboxInput => ({
      chatId,
      text,
      important: false,
      photoUri: null,
      fileUri: null,
      position: null,
    });

    beforeEach(async () => {
      storage = await make();
      await storage.chats.applySnapshot(
        [
          {
            id: 1,
            name: "Chat 1",
            visibility: "private",
            directchat: false,
            role: "member",
            joined: true,
            ownerUserid: "owner",
            members: [],
          },
          {
            id: 2,
            name: "Chat 2",
            visibility: "private",
            directchat: false,
            role: "member",
            joined: true,
            ownerUserid: "owner",
            members: [],
          },
          {
            id: 3,
            name: "Chat 3",
            visibility: "private",
            directchat: false,
            role: "member",
            joined: true,
            ownerUserid: "owner",
            members: [],
          },
        ],
        1000,
      );
    });

    it("creates a pending row with attempts 0, the given id, and createdAt", async () => {
      const row = await storage.outbox.enqueue(input(1), "cid-1", 5000);
      expect(row).toMatchObject({
        clientMessageId: "cid-1",
        chatId: 1,
        text: "hi",
        important: false,
        photoUri: null,
        fileUri: null,
        position: null,
        status: "pending",
        attempts: 0,
        nextRetryAt: null,
        lastError: null,
        createdAt: 5000,
      });
    });

    it("rejects enqueue for an unknown chat and creates nothing", async () => {
      await expect(
        storage.outbox.enqueue(input(99), "cid-x", 5000),
      ).rejects.toThrow();
      expect(await storage.outbox.listByChat(99)).toEqual([]);
    });

    it("lists rows by chat oldest first, and an empty list for a chat with none", async () => {
      await storage.outbox.enqueue(input(1, "first"), "cid-1", 1000);
      await storage.outbox.enqueue(input(1, "second"), "cid-2", 2000);
      await storage.outbox.enqueue(input(2, "other"), "cid-3", 1500);
      expect(
        (await storage.outbox.listByChat(1)).map((r) => r.clientMessageId),
      ).toEqual(["cid-1", "cid-2"]);
      expect(await storage.outbox.listByChat(2)).toHaveLength(1);
      expect(await storage.outbox.listByChat(3)).toEqual([]);
    });

    it("uses insertion order when createdAt is identical", async () => {
      await storage.outbox.enqueue(input(1, "first"), "cid-same-1", 1000);
      await storage.outbox.enqueue(input(1, "second"), "cid-same-2", 1000);
      expect(
        (await storage.outbox.listByChat(1)).map((r) => r.clientMessageId),
      ).toEqual(["cid-same-1", "cid-same-2"]);
      expect(
        (await storage.outbox.listDue(1000)).map((r) => r.clientMessageId),
      ).toEqual(["cid-same-1", "cid-same-2"]);
    });

    it("discards a non-sending row but not a sending row", async () => {
      await storage.outbox.enqueue(input(1, "failed"), "cid-failed", 1000);
      await storage.outbox.markFailed("cid-failed", "offline", 2000);
      await storage.outbox.enqueue(input(1, "sending"), "cid-sending", 1100);
      await storage.outbox.markSending("cid-sending");

      expect(await storage.outbox.discard("cid-failed")).toMatchObject({
        clientMessageId: "cid-failed",
      });
      expect(await storage.outbox.discard("cid-sending")).toBeNull();
      expect(await storage.outbox.discard("unknown-id")).toBeNull();
    });

    it("updates the text of a non-sending row in place", async () => {
      await storage.outbox.enqueue(input(1, "alt"), "cid-a", 1000);
      await storage.outbox.enqueue(input(1, "danach"), "cid-b", 1100);
      await storage.outbox.enqueue(input(1, "sending"), "cid-sending", 1200);
      await storage.outbox.markSending("cid-sending");

      expect(await storage.outbox.updateText("cid-a", "neu")).toMatchObject({
        clientMessageId: "cid-a",
        text: "neu",
      });
      expect(await storage.outbox.updateText("cid-sending", "x")).toBeNull();
      expect(await storage.outbox.updateText("unknown-id", "x")).toBeNull();
      expect((await storage.outbox.listByChat(1)).map((r) => [r.clientMessageId, r.text])).toEqual([
        ["cid-a", "neu"],
        ["cid-b", "danach"],
        ["cid-sending", "sending"],
      ]);
    });

    it("lists chat ids blocked by sending or future-failed rows", async () => {
      await storage.outbox.enqueue(input(1, "sending"), "cid-sending", 1000);
      await storage.outbox.markSending("cid-sending");
      await storage.outbox.enqueue(input(2, "future"), "cid-future", 1000);
      await storage.outbox.markFailed("cid-future", "offline", 2000);
      await storage.outbox.enqueue(input(1, "due"), "cid-due", 900);
      await storage.outbox.enqueue(input(3, "untouched"), "cid-untouched", 900);

      expect(new Set(await storage.outbox.listBlockedChatIds(1500))).toEqual(
        new Set([1, 2]),
      );
    });

    it("listDue returns pending and due failed rows oldest first, excludes sending and not-yet-due failed rows", async () => {
      await storage.outbox.enqueue(
        input(1, "pending-row"),
        "cid-pending",
        1000,
      );
      await storage.outbox.enqueue(
        input(1, "sending-row"),
        "cid-sending",
        1100,
      );
      await storage.outbox.markSending("cid-sending");
      await storage.outbox.enqueue(input(1, "due-failed"), "cid-due", 900);
      await storage.outbox.markFailed("cid-due", "offline", 5000);
      await storage.outbox.enqueue(
        input(1, "future-failed"),
        "cid-future",
        950,
      );
      await storage.outbox.markFailed("cid-future", "offline", 9999);

      const due = await storage.outbox.listDue(5000);
      expect(due.map((r) => r.clientMessageId)).toEqual([
        "cid-due",
        "cid-pending",
      ]);
    });

    it("markSending transitions pending or failed to sending and reports the transition", async () => {
      await storage.outbox.enqueue(input(1), "cid-1", 1000);
      expect(await storage.outbox.markSending("cid-1")).toBe(true);
      expect((await storage.outbox.listByChat(1))[0]?.status).toBe("sending");

      await expect(storage.outbox.markSending("cid-1")).resolves.toBe(false);
      expect((await storage.outbox.listByChat(1))[0]?.status).toBe("sending");

      await storage.outbox.enqueue(input(1), "cid-failed", 1000);
      await storage.outbox.markFailed("cid-failed", "offline", 2000);
      expect(await storage.outbox.markSending("cid-failed")).toBe(true);
      expect((await storage.outbox.listByChat(1))[1]?.status).toBe("sending");

      await expect(storage.outbox.markSending("unknown-id")).resolves.toBe(false);
    });

    it("markFailed sets status, increments attempts, sets lastError/nextRetryAt, and is a no-op for unknown rows", async () => {
      await storage.outbox.enqueue(input(1), "cid-1", 1000);
      await storage.outbox.markSending("cid-1");
      await storage.outbox.markFailed("cid-1", "offline", 6000);
      const [row] = await storage.outbox.listByChat(1);
      expect(row).toMatchObject({
        status: "failed",
        attempts: 1,
        lastError: "offline",
        nextRetryAt: 6000,
      });

      await storage.outbox.markFailed("cid-1", "offline again", 7000);
      const [row2] = await storage.outbox.listByChat(1);
      expect(row2).toMatchObject({
        status: "failed",
        attempts: 2,
        lastError: "offline again",
        nextRetryAt: 7000,
      });

      await expect(
        storage.outbox.markFailed("unknown-id", "x", 1),
      ).resolves.toBeUndefined();
    });

    it("remove deletes the row, and is a no-op for an unknown id", async () => {
      await storage.outbox.enqueue(input(1), "cid-1", 1000);
      await storage.outbox.remove("cid-1");
      expect(await storage.outbox.listByChat(1)).toEqual([]);
      await expect(
        storage.outbox.remove("unknown-id"),
      ).resolves.toBeUndefined();
    });

    it("resetStuckSending resets every sending row to pending without touching pending, failed, or other chats", async () => {
      await storage.outbox.enqueue(input(1, "a"), "cid-a", 1000);
      await storage.outbox.markSending("cid-a");
      await storage.outbox.enqueue(input(1, "b"), "cid-b", 1100); // stays pending
      await storage.outbox.enqueue(input(2, "c"), "cid-c", 1200);
      await storage.outbox.markSending("cid-c");
      await storage.outbox.enqueue(input(1, "d"), "cid-d", 1300);
      await storage.outbox.markFailed("cid-d", "offline", 2000);

      await storage.outbox.resetStuckSending();

      const rowsChat1 = await storage.outbox.listByChat(1);
      const byId = new Map(rowsChat1.map((r) => [r.clientMessageId, r]));
      expect(byId.get("cid-a")?.status).toBe("pending");
      expect(byId.get("cid-b")?.status).toBe("pending");
      expect(byId.get("cid-d")?.status).toBe("failed");
      const rowsChat2 = await storage.outbox.listByChat(2);
      expect(rowsChat2.find((r) => r.clientMessageId === "cid-c")?.status).toBe(
        "pending",
      );
    });

    it("cascades: purging a chat removes its outbox rows without affecting another chat", async () => {
      await storage.outbox.enqueue(input(1), "cid-1", 1000);
      await storage.outbox.enqueue(input(2), "cid-2", 1000);
      await storage.chats.purge(1);
      expect(await storage.outbox.listByChat(1)).toEqual([]);
      expect(await storage.outbox.listByChat(2)).toHaveLength(1);
    });

    it("returns copies: mutating a returned row does not affect a later read", async () => {
      await storage.outbox.enqueue(input(1), "cid-1", 1000);
      const [row] = await storage.outbox.listByChat(1);
      if (!row) throw new Error("expected a stored row");
      row.text = "mutated";
      row.attempts = 99;
      const [fresh] = await storage.outbox.listByChat(1);
      expect(fresh?.text).toBe("hi");
      expect(fresh?.attempts).toBe(0);
    });
  });
}
