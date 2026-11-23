import * as React from "react";
import { act, create } from "react-test-renderer";

import { MemoryAccountStorageFactory } from "../storage/memory";
import type { AccountStorage } from "../storage/ports";
import type { ChatSnapshot } from "../storage/types";
import * as runtimeModule from "../messaging/runtime";
import { useChats } from "./use-chats";

type RuntimeModule = typeof import("../messaging/runtime");
type RuntimeMock = RuntimeModule & {
  __setStorage: (storage: AccountStorage | null) => void;
};

jest.mock("../messaging/runtime", () => {
  const chatListeners = new Set<() => void>();
  let storage: import("../storage/ports").AccountStorage | null = null;
  return {
    storageEvents: {
      subscribeChats: (listener: () => void) => {
        chatListeners.add(listener);
        return () => {
          chatListeners.delete(listener);
        };
      },
      emitChats: () => {
        for (const listener of [...chatListeners]) listener();
      },
      subscribeMessages: () => () => {
        // Not exercised by this hook.
      },
      emitMessages: () => {
        // Not exercised by this hook.
      },
    },
    syncRuntime: {
      getAccountStorage: () => storage,
      setOpenChatId: () => {
        // Not exercised by this hook.
      },
      pollNow: async () => ({ status: "aborted" as const }),
    },
    __setStorage: (next: import("../storage/ports").AccountStorage | null) => {
      storage = next;
    },
  };
});

const runtimeMock = runtimeModule as unknown as RuntimeMock;

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

function buildSnapshot(id: number, name: string): ChatSnapshot {
  return {
    id,
    name,
    visibility: "private",
    directchat: false,
    role: "member",
    joined: true,
    ownerUserid: null,
    members: [],
  };
}

function Harness({
  onResult,
}: Readonly<{ onResult: (result: ReturnType<typeof useChats>) => void }>) {
  const result = useChats({ joined: true });
  onResult(result);
  return null;
}

describe("useChats", () => {
  let storage: AccountStorage;

  beforeEach(async () => {
    const factory = new MemoryAccountStorageFactory();
    storage = await factory.open("acc1");
    runtimeMock.__setStorage(storage);
  });

  test("reads chats from the active account storage on mount", async () => {
    await storage.chats.applySnapshot([buildSnapshot(1, "Chat 1")], 0);
    let latest: ReturnType<typeof useChats> | undefined;
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(
        React.createElement(Harness, {
          onResult: (result) => {
            latest = result;
          },
        }),
      );
      await flush();
    });
    expect(latest?.loading).toBe(false);
    expect(latest?.chats.map((chat) => chat.name)).toEqual(["Chat 1"]);
    renderer?.unmount();
  });

  test("re-reads when storageEvents.emitChats fires", async () => {
    let latest: ReturnType<typeof useChats> | undefined;
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(
        React.createElement(Harness, {
          onResult: (result) => {
            latest = result;
          },
        }),
      );
      await flush();
    });
    expect(latest?.chats).toEqual([]);

    await storage.chats.applySnapshot([buildSnapshot(2, "Chat 2")], 0);
    await act(async () => {
      runtimeModule.storageEvents.emitChats();
      await flush();
    });
    expect(latest?.chats.map((chat) => chat.name)).toEqual(["Chat 2"]);
    renderer?.unmount();
  });
});
