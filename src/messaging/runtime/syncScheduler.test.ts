/** @jest-environment node */
import { MemoryAccountStorageFactory } from "../../storage/memory";
import type { AccountStorage } from "../../storage/ports";
import { FakeSyncApi, isFakeNetworkError, snap } from "../__tests__/fakes";
import { InvalidTokenError } from "../errors";
import type { ForegroundSignal } from "./foregroundSignal";
import { StorageEvents } from "./storageEvents";
import { SyncScheduler, type SessionLike } from "./syncScheduler";

type SessionState = ReturnType<SessionLike["getState"]>;

class FakeSession implements SessionLike {
  private state: SessionState = { status: "signed_out" };
  private readonly listeners = new Set<() => void>();

  getState(): SessionState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setState(state: SessionState): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener();
  }
}

class FakeForeground implements ForegroundSignal {
  private foreground = true;
  private readonly listeners = new Set<() => void>();

  isForeground(): boolean {
    return this.foreground;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setForeground(value: boolean): void {
    this.foreground = value;
    for (const listener of [...this.listeners]) listener();
  }
}

// Drains the microtask queue. A full sync cycle (open storage -> syncChats -> syncProfiles ->
// serialized polls -> apply/emit) is a chain of ~30+ awaited levels, and each loop here advances
// that chain by only about one level (microtasks run FIFO), so a too-small default makes
// cycle-completion assertions (e.g. listener emits) run before the cycle finishes. Pure
// microtasks: safe to call while fake timers are active, unlike setImmediate-based flushing.
async function flush(loops = 50): Promise<void> {
  for (let i = 0; i < loops; i++) await Promise.resolve();
}

function setup(intervalMs = 5000) {
  const session = new FakeSession();
  const foreground = new FakeForeground();
  const events = new StorageEvents();
  const api = new FakeSyncApi();
  const factory = new MemoryAccountStorageFactory();
  const openCalls: string[] = [];
  const closedIds: string[] = [];
  const invalidTokenCalls: number[] = [];
  let openFailuresLeft = 0;

  const scheduler = new SyncScheduler({
    session,
    foreground,
    events,
    now: Date.now,
    isNetworkError: isFakeNetworkError,
    onInvalidToken: () => {
      invalidTokenCalls.push(Date.now());
    },
    openAccountStorage: async (accountId: string): Promise<AccountStorage> => {
      openCalls.push(accountId);
      if (openFailuresLeft > 0) {
        openFailuresLeft -= 1;
        throw new Error("storage open failed");
      }
      const storage = await factory.open(accountId);
      const originalClose = storage.close.bind(storage);
      return {
        ...storage,
        close: async () => {
          closedIds.push(accountId);
          await originalClose();
        },
      };
    },
    createSyncApi: () => api,
    intervalMs,
  });

  return {
    session,
    foreground,
    events,
    api,
    factory,
    scheduler,
    openCalls,
    closedIds,
    invalidTokenCalls,
    failNextOpens: (count: number) => {
      openFailuresLeft = count;
    },
  };
}

describe("SyncScheduler", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("opens storage and starts cycling on sign-in", async () => {
    const { session, scheduler, api, openCalls } = setup();
    scheduler.start();
    await flush();
    expect(scheduler.getAccountStorage()).toBeNull();

    session.setState({ status: "signed_in", account: { id: "acc1" } });
    await flush();

    expect(openCalls).toEqual(["acc1"]);
    expect(scheduler.getAccountStorage()).not.toBeNull();
    expect(api.callsOf("getChats")).toHaveLength(1);
    expect(scheduler.getStatus().status).toBe("ok");
    scheduler.stop();
  });

  test("disposes and closes storage on sign-out", async () => {
    const { session, scheduler, closedIds } = setup();
    scheduler.start();
    session.setState({ status: "signed_in", account: { id: "acc1" } });
    await flush();

    session.setState({ status: "signed_out" });
    await flush();

    expect(closedIds).toEqual(["acc1"]);
    expect(scheduler.getAccountStorage()).toBeNull();
    expect(scheduler.getStatus().status).toBe("none");
    scheduler.stop();
  });

  test("disposes and re-opens on an account switch", async () => {
    const { session, scheduler, openCalls, closedIds } = setup();
    scheduler.start();
    session.setState({ status: "signed_in", account: { id: "acc1" } });
    await flush();

    session.setState({ status: "signed_in", account: { id: "acc2" } });
    await flush();

    expect(openCalls).toEqual(["acc1", "acc2"]);
    expect(closedIds).toEqual(["acc1"]);
    expect(scheduler.getAccountStorage()).not.toBeNull();
    scheduler.stop();
  });

  test("runs a cycle every intervalMs while foreground", async () => {
    jest.useFakeTimers();
    const { session, scheduler, api } = setup(5000);
    scheduler.start();
    session.setState({ status: "signed_in", account: { id: "acc1" } });
    await flush();
    expect(api.callsOf("getChats")).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(5000);
    expect(api.callsOf("getChats")).toHaveLength(2);

    await jest.advanceTimersByTimeAsync(5000);
    expect(api.callsOf("getChats")).toHaveLength(3);
    scheduler.stop();
  });

  test("stops scheduling in the background and resumes with an immediate cycle on foreground", async () => {
    jest.useFakeTimers();
    const { session, scheduler, foreground, api } = setup(5000);
    scheduler.start();
    session.setState({ status: "signed_in", account: { id: "acc1" } });
    await flush();
    const afterSignIn = api.callsOf("getChats").length;

    foreground.setForeground(false);
    await jest.advanceTimersByTimeAsync(20000);
    expect(api.callsOf("getChats")).toHaveLength(afterSignIn); // no new cycles while backgrounded

    foreground.setForeground(true);
    await flush();
    expect(api.callsOf("getChats").length).toBeGreaterThan(afterSignIn); // immediate cycle

    const afterResume = api.callsOf("getChats").length;
    await jest.advanceTimersByTimeAsync(5000);
    expect(api.callsOf("getChats").length).toBeGreaterThan(afterResume); // interval resumed
    scheduler.stop();
  });

  test("pollNow works while backgrounded", async () => {
    const { session, foreground, scheduler, factory, api } = setup();
    foreground.setForeground(false);
    session.setState({ status: "signed_in", account: { id: "acc1" } });
    scheduler.start();
    await flush();

    // Storage is open (pollNow works) even though no cycle has run (backgrounded).
    expect(scheduler.getAccountStorage()).not.toBeNull();
    expect(api.callsOf("getChats")).toHaveLength(0);

    const storage = await factory.open("acc1");
    await storage.chats.applySnapshot([snap(1)], Date.now());
    api.messages.set(1, []);

    const result = await scheduler.pollNow(1);
    expect(result.status).toBe("ok");
    scheduler.stop();
  });

  test("setOpenChatId is passed through to runCycle", async () => {
    jest.useFakeTimers();
    const { session, scheduler, factory, api } = setup();
    const storage = await factory.open("acc1");
    await storage.chats.applySnapshot([snap(1), snap(2)], Date.now());
    api.chats = [snap(1), snap(2)];
    api.messages.set(1, []);
    api.messages.set(2, []);

    scheduler.setOpenChatId(1);
    session.setState({ status: "signed_in", account: { id: "acc1" } });
    scheduler.start();
    await flush();

    // First cycle: chat 1 is polled as the open chat; chat 2 is polled too, because a
    // chat without a recorded poll counts as due immediately.
    expect(api.messageCalls(1)).toHaveLength(1);
    expect(api.messageCalls(2)).toHaveLength(1);

    // Second cycle after intervalMs (5 s), still far below otherChatsIntervalMs (30 s):
    // only the open chat is polled again; chat 2 must wait for its interval.
    await jest.advanceTimersByTimeAsync(5000);
    await flush();
    expect(api.messageCalls(1)).toHaveLength(2);
    expect(api.messageCalls(2)).toHaveLength(1);
    scheduler.stop();
  });

  test('emits emitChats only on chats: "updated" or purges, never on a failed chats fetch alone', async () => {
    const { session, scheduler, api, events } = setup();
    const chatsListener = jest.fn();
    events.subscribeChats(chatsListener);

    api.failWith("getChats", new Error("boom"));
    session.setState({ status: "signed_in", account: { id: "acc1" } });
    scheduler.start();
    await flush();

    expect(scheduler.getStatus().status).toBe("ok"); // a generic error does not stop the cycle
    expect(chatsListener).not.toHaveBeenCalled();
    scheduler.stop();
  });

  test("emits emitMessages only for chats with actual inserts or a purge", async () => {
    const { session, scheduler, factory, api, events } = setup();
    const storage = await factory.open("acc1");
    await storage.chats.applySnapshot([snap(1), snap(2)], Date.now());
    // getchats must still list both chats: an empty response marks them missing, and missing
    // chats are skipped by polling (only existence checks run), so nothing would be inserted.
    api.chats = [snap(1), snap(2)];
    api.messages.set(1, [
      {
        id: 1,
        userid: "a",
        userNick: null,
        userFullname: null,
        userHash: null,
        serverTime: null,
        important: false,
        text: "t",
        photoId: null,
        fileId: null,
        position: null,
      },
    ]);
    api.messages.set(2, []); // no messages: an 'ok' poll with inserted === 0

    const chat1Listener = jest.fn();
    const chat2Listener = jest.fn();
    events.subscribeMessages(1, chat1Listener);
    events.subscribeMessages(2, chat2Listener);

    session.setState({ status: "signed_in", account: { id: "acc1" } });
    scheduler.start();
    await flush();

    expect(chat1Listener).toHaveBeenCalledTimes(1);
    expect(chat2Listener).not.toHaveBeenCalled();
    scheduler.stop();
  });

  test("onInvalidToken is wired through to the deps callback", async () => {
    const { session, scheduler, api, invalidTokenCalls } = setup();
    api.failWith("getChats", new InvalidTokenError());
    session.setState({ status: "signed_in", account: { id: "acc1" } });
    scheduler.start();
    await flush();

    expect(invalidTokenCalls).toHaveLength(1);
    expect(scheduler.getStatus().status).toBe("invalid_token");
    scheduler.stop();
  });

  test("stop() prevents all further activity", async () => {
    jest.useFakeTimers();
    const { session, scheduler, api } = setup(5000);
    scheduler.start();
    session.setState({ status: "signed_in", account: { id: "acc1" } });
    await flush();
    const callsBeforeStop = api.callsOf("getChats").length;

    scheduler.stop();
    session.setState({ status: "signed_in", account: { id: "acc2" } }); // ignored after stop
    await jest.advanceTimersByTimeAsync(20000);

    expect(api.callsOf("getChats")).toHaveLength(callsBeforeStop);
    expect(scheduler.getAccountStorage()).toBeNull();
  });

  test("a failing openAccountStorage does not throw out of the scheduler and is retried later", async () => {
    jest.useFakeTimers();
    const { session, scheduler, failNextOpens, openCalls, api } = setup(5000);
    failNextOpens(1);
    scheduler.start();
    expect(() =>
      session.setState({ status: "signed_in", account: { id: "acc1" } }),
    ).not.toThrow();
    await flush();

    expect(openCalls).toEqual(["acc1"]);
    expect(scheduler.getStatus().status).toBe("storage_error");
    expect(scheduler.getAccountStorage()).toBeNull();

    await jest.advanceTimersByTimeAsync(5000);
    await flush();

    expect(openCalls).toEqual(["acc1", "acc1"]);
    expect(scheduler.getAccountStorage()).not.toBeNull();
    expect(api.callsOf("getChats")).toHaveLength(1);
    scheduler.stop();
  });
});
