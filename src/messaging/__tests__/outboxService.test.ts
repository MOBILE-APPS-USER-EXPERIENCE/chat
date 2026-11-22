/** @jest-environment node */
import { MemoryAccountStorageFactory } from "../../storage/memory";
import type { AccountStorage } from "../../storage/ports";
import { InvalidTokenError } from "../errors";
import { OutboxService, type OutboxDeps } from "../outboxService";
import {
  FakeNetworkError,
  FakeSyncApi,
  isFakeNetworkError,
  snap,
} from "./fakes";

describe("OutboxService", () => {
  let storage: AccountStorage;
  let api: FakeSyncApi;
  let now: number;
  let current: boolean;
  let idCounter: number;
  let invalidTokenCalls: number;
  let rowChanged: number[];
  let sentChats: number[];

  beforeEach(async () => {
    storage = await new MemoryAccountStorageFactory().open("acc");
    await storage.chats.applySnapshot([snap(1), snap(2)], 0);
    api = new FakeSyncApi();
    now = 1000;
    current = true;
    idCounter = 0;
    invalidTokenCalls = 0;
    rowChanged = [];
    sentChats = [];
  });

  function createService(
    overrideApi: FakeSyncApi = api,
    extra: Partial<OutboxDeps> = {},
  ): OutboxService {
    return new OutboxService({
      api: overrideApi,
      storage,
      now: () => now,
      isCurrent: () => current,
      isNetworkError: isFakeNetworkError,
      onInvalidToken: () => {
        invalidTokenCalls++;
      },
      newId: () => `id-${++idCounter}`,
      onRowChanged: (chatId) => {
        rowChanged.push(chatId);
      },
      onSent: (chatId) => {
        sentChats.push(chatId);
      },
      ...extra,
    });
  }

  it("sends an enqueued message and removes the row on success", async () => {
    const service = createService();
    await service.enqueue(1, "hello");
    expect(await storage.outbox.listByChat(1)).toHaveLength(1);

    await service.drain();

    expect(await storage.outbox.listByChat(1)).toEqual([]);
    expect(api.postMessageCalls).toEqual([
      { chatId: 1, text: "hello", important: false },
    ]);
    expect(rowChanged).toEqual([1]);
  });

  it("calls onSent with the chat id after a successful send, and not on a failure", async () => {
    const service = createService();
    await service.enqueue(1, "hello");
    await service.drain();
    expect(sentChats).toEqual([1]);

    api.failWith("postMessage", new Error("boom"));
    sentChats.length = 0;
    await service.enqueue(2, "world");
    await service.drain();
    expect(sentChats).toEqual([]);
  });

  it("leaves a failing row failed with attempts 1 and a future nextRetryAt", async () => {
    api.failWith("postMessage", new Error("server exploded"));
    const service = createService();
    await service.enqueue(1, "hello");

    await service.drain();

    const [row] = await storage.outbox.listByChat(1);
    expect(row).toMatchObject({
      status: "failed",
      attempts: 1,
      lastError: "server exploded",
    });
    expect(row?.nextRetryAt).toBeGreaterThan(now);
    expect(rowChanged).toEqual([1]);
  });

  it("retries a due failed row and removes it on success", async () => {
    const failingApi = new FakeSyncApi();
    failingApi.failWith("postMessage", new Error("boom"));
    const service1 = createService(failingApi);
    await service1.enqueue(1, "hello");
    await service1.drain();

    const [failedRow] = await storage.outbox.listByChat(1);
    expect(failedRow?.status).toBe("failed");
    now = failedRow?.nextRetryAt ?? now; // make it due

    const freshApi = new FakeSyncApi();
    const service2 = createService(freshApi);
    await service2.drain();

    expect(await storage.outbox.listByChat(1)).toEqual([]);
    expect(freshApi.postMessageCalls).toHaveLength(1);
  });

  it("stops draining on an invalid token and calls onInvalidToken once", async () => {
    api.failWith("postMessage", new InvalidTokenError());
    const service = createService();
    await service.enqueue(1, "first");
    await service.enqueue(2, "second");

    await service.drain();

    expect(invalidTokenCalls).toBe(1);
    const row1 = (await storage.outbox.listByChat(1))[0];
    const row2 = (await storage.outbox.listByChat(2))[0];
    expect(row1?.status).toBe("sending"); // markSending happened before the failing send
    expect(row2?.status).toBe("pending"); // never attempted: draining stopped
    expect(rowChanged).toEqual([]);
    expect(sentChats).toEqual([]);
  });

  it("leaves a row failed on a network error without calling onInvalidToken", async () => {
    api.failWith("postMessage", new FakeNetworkError());
    const service = createService();
    await service.enqueue(1, "hello");

    await service.drain();

    const [row] = await storage.outbox.listByChat(1);
    expect(row).toMatchObject({ status: "failed", lastError: "offline" });
    expect(invalidTokenCalls).toBe(0);
    expect(sentChats).toEqual([]);
  });

  it("stops the whole drain after the first network error", async () => {
    api.failWith("postMessage", new FakeNetworkError());
    const service = createService();
    await service.enqueue(1, "first");
    await service.enqueue(2, "second");

    await service.drain();

    expect(api.postMessageCalls).toEqual([]);
    expect((await storage.outbox.listByChat(1))[0]?.status).toBe("failed");
    expect((await storage.outbox.listByChat(2))[0]?.status).toBe("pending");
  });

  it("blocks later rows of one chat after a failure but continues other chats", async () => {
    api.failWith("postMessage", new Error("boom"), { chatId: 1 });
    const service = createService();
    await service.enqueue(1, "first");
    await service.enqueue(1, "second");
    await service.enqueue(2, "other");

    await service.drain();

    expect(api.callsOf("postMessage").map((call) => call.chatId)).toEqual([1, 2]);
    expect((await storage.outbox.listByChat(1))[1]?.status).toBe("pending");
  });

  it("blocks later rows while an earlier row is sending or future-failed", async () => {
    const service = createService();
    await service.enqueue(1, "sending");
    await storage.outbox.markSending("id-1");
    await service.enqueue(1, "later");
    await service.drain();
    expect(api.postMessageCalls).toEqual([]);

    await storage.outbox.resetStuckSending();
    const [first] = await storage.outbox.listByChat(1);
    if (first) await storage.outbox.markFailed(first.clientMessageId, "offline", now + 5000);
    await service.drain();
    expect(api.postMessageCalls).toEqual([]);
  });

  it("remove throwing after success leaves the row sending and does not resend it", async () => {
    const service = createService();
    await service.enqueue(1, "hello");
    const throwingOutbox = storage.outbox;
    throwingOutbox.remove = async () => {
      throw new Error("remove failed");
    };

    await expect(service.drain()).rejects.toThrow("remove failed");

    expect((await storage.outbox.listByChat(1))[0]?.status).toBe("sending");
    expect(api.postMessageCalls).toHaveLength(1);
  });

  it("discards only a non-sending row", async () => {
    const service = createService();
    await service.enqueue(1, "failed");
    await storage.outbox.markFailed("id-1", "offline", now + 1000);
    expect(await service.discard("id-1")).toBe(true);
    expect(await storage.outbox.listByChat(1)).toEqual([]);

    await service.enqueue(1, "sending");
    await storage.outbox.markSending("id-2");
    expect(await service.discard("id-2")).toBe(false);
    expect((await storage.outbox.listByChat(1))[0]?.status).toBe("sending");
  });

  it("discards without writing when isCurrent() turns false mid-drain", async () => {
    const service = createService();
    await service.enqueue(1, "hello");
    api.onCall = (call) => {
      if (call.method === "postMessage") current = false;
    };

    await service.drain();

    const [row] = await storage.outbox.listByChat(1);
    // markSending already wrote before the call; the row is never removed or marked failed.
    expect(row?.status).toBe("sending");
    expect(rowChanged).toEqual([]);
    expect(sentChats).toEqual([]);
  });

  it("calls resetStuckSending on init()", async () => {
    await storage.outbox.enqueue(
      {
        chatId: 1,
        text: "stuck",
        important: false,
        photoUri: null,
        fileUri: null,
        position: null,
      },
      "stuck-id",
      now,
    );
    await storage.outbox.markSending("stuck-id");
    const service = createService();

    await service.init();

    const [row] = await storage.outbox.listByChat(1);
    expect(row?.status).toBe("pending");
  });

  it("rejects empty text and creates nothing", async () => {
    const service = createService();
    await expect(service.enqueue(1, "   ")).rejects.toThrow();
    expect(await storage.outbox.listByChat(1)).toEqual([]);
  });

  it("drains due items across chats in one call, oldest created first", async () => {
    const service = createService();
    now = 1000;
    await service.enqueue(2, "second-chat-first-created");
    now = 2000;
    await service.enqueue(1, "first-chat-second-created");

    await service.drain();

    expect(api.postMessageCalls.map((call) => call.chatId)).toEqual([2, 1]);
    expect(await storage.outbox.listByChat(1)).toEqual([]);
    expect(await storage.outbox.listByChat(2)).toEqual([]);
    expect(sentChats).toEqual([2, 1]);
  });
});
