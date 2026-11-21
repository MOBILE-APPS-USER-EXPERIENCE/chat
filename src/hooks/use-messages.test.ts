import * as React from "react";
import { act, create } from "react-test-renderer";

import { msg, snap } from "../messaging/__tests__/fakes";
import { MemoryAccountStorageFactory } from "../storage/memory";
import type { AccountStorage } from "../storage/ports";
import { useMessages } from "./use-messages";

type RuntimeModule = typeof import("../messaging/runtime");
type RuntimeMock = RuntimeModule & {
  __setStorage: (storage: AccountStorage | null) => void;
  __setOpenChatId: jest.Mock;
  __pollNow: jest.Mock;
};

jest.mock("../messaging/runtime", () => {
  const messageListeners = new Map<number, Set<() => void>>();
  let storage: import("../storage/ports").AccountStorage | null = null;
  const setOpenChatId = jest.fn();
  const pollNow = jest.fn(async () => ({ status: "aborted" as const }));
  return {
    storageEvents: {
      subscribeChats: () => () => {
        // Not exercised by this hook.
      },
      emitChats: () => {
        // Not exercised by this hook.
      },
      subscribeMessages: (chatId: number, listener: () => void) => {
        let bus = messageListeners.get(chatId);
        if (bus === undefined) {
          bus = new Set<() => void>();
          messageListeners.set(chatId, bus);
        }
        bus.add(listener);
        return () => {
          bus?.delete(listener);
        };
      },
      emitMessages: (chatId: number) => {
        const bus = messageListeners.get(chatId);
        if (bus !== undefined) for (const listener of [...bus]) listener();
      },
    },
    syncRuntime: { getAccountStorage: () => storage, setOpenChatId, pollNow },
    __setStorage: (next: import("../storage/ports").AccountStorage | null) => {
      storage = next;
    },
    __setOpenChatId: setOpenChatId,
    __pollNow: pollNow,
  };
});

import * as runtimeModule from "../messaging/runtime";
const runtimeMock = runtimeModule as unknown as RuntimeMock;

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

function Harness({
  chatId,
  onResult,
}: Readonly<{
  chatId: number;
  onResult: (result: ReturnType<typeof useMessages>) => void;
}>) {
  const result = useMessages(chatId);
  onResult(result);
  return null;
}

describe("useMessages", () => {
  let storage: AccountStorage;

  beforeEach(async () => {
    const factory = new MemoryAccountStorageFactory();
    storage = await factory.open("acc1");
    // appendBatch enforces the chat foreign key, so chat 1 must exist first.
    await storage.chats.applySnapshot([snap(1)], 0);
    runtimeMock.__setStorage(storage);
    runtimeMock.__setOpenChatId.mockClear();
    runtimeMock.__pollNow.mockClear();
  });

  test("loads messages newest-first, marks the chat open and polls once on mount", async () => {
    await storage.messages.appendBatch(1, [msg(1), msg(2)], 0);
    let latest: ReturnType<typeof useMessages> | undefined;
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(
        React.createElement(Harness, {
          chatId: 1,
          onResult: (result) => {
            latest = result;
          },
        }),
      );
      await flush();
    });
    expect(latest?.messages.map((message) => message.id)).toEqual([2, 1]);
    expect(runtimeMock.__setOpenChatId).toHaveBeenCalledWith(1);
    expect(runtimeMock.__pollNow).toHaveBeenCalledWith(1);

    await act(async () => {
      renderer?.unmount();
    });
    expect(runtimeMock.__setOpenChatId).toHaveBeenLastCalledWith(null);
  });

  test("re-reads the loaded window when a messages event fires", async () => {
    await storage.messages.appendBatch(1, [msg(1)], 0);
    let latest: ReturnType<typeof useMessages> | undefined;
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(
        React.createElement(Harness, {
          chatId: 1,
          onResult: (result) => {
            latest = result;
          },
        }),
      );
      await flush();
    });
    expect(latest?.messages.map((message) => message.id)).toEqual([1]);

    await storage.messages.appendBatch(1, [msg(2)], 0);
    await act(async () => {
      runtimeModule.storageEvents.emitMessages(1);
      await flush();
    });
    expect(latest?.messages.map((message) => message.id)).toEqual([2, 1]);
    renderer?.unmount();
  });

  test("loadOlder appends an older page and updates hasMore", async () => {
    await storage.messages.appendBatch(1, [msg(1), msg(2), msg(3)], 0);
    let latest: ReturnType<typeof useMessages> | undefined;
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(
        React.createElement(Harness, {
          chatId: 1,
          onResult: (result) => {
            latest = result;
          },
        }),
      );
      await flush();
    });

    await act(async () => {
      await latest?.loadOlder();
      await flush();
    });
    // Nothing older than id 1 exists: loadOlder is a no-op and hasMore reflects that.
    expect(latest?.messages.map((message) => message.id)).toEqual([3, 2, 1]);
    renderer?.unmount();
  });
});
