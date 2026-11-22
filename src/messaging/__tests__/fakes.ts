/**
 * Shared helpers for the messaging tests: a scriptable fake `SyncApi` and data builders.
 * Not a test file on purpose: `testMatch` only picks `*.test.ts`.
 */
import type { ChatSnapshot, RawMessageInput } from "../../storage/types";
import { ChatNotFoundError } from "../errors";
import type { ProfileInput, SyncApi } from "../ports";

export class FakeNetworkError extends Error {
  constructor() {
    super("Network request failed");
    this.name = "FakeNetworkError";
  }
}

export const isFakeNetworkError = (error: unknown): boolean =>
  error instanceof FakeNetworkError;

export type ApiMethod =
  | "getChats"
  | "getProfiles"
  | "getMessages"
  | "postMessage";
export type ApiCall = { method: ApiMethod; chatId?: number; fromId?: number };
type Failure = {
  method: ApiMethod;
  chatId?: number;
  fromId?: number;
  error: Error;
};

export class FakeSyncApi implements SyncApi {
  chats: ChatSnapshot[] = [];
  profiles: ProfileInput[] = [];
  /** A chat exists on the fake server iff it has an entry here; ids must be ascending. */
  readonly messages = new Map<number, RawMessageInput[]>();
  readonly calls: ApiCall[] = [];
  /** Detailed log of accepted `postMessage` calls (a failed attempt is not recorded here). */
  readonly postMessageCalls: {
    chatId: number;
    text: string;
    important: boolean;
  }[] = [];
  /** Called synchronously when a request starts. */
  onCall: ((call: ApiCall) => void) | null = null;
  private readonly failures: Failure[] = [];
  private gate: Promise<void> | null = null;
  private postGate: Promise<void> | null = null;

  /** Makes matching requests fail until the end of the test. */
  failWith(
    method: ApiMethod,
    error: Error,
    match: { chatId?: number; fromId?: number } = {},
  ): void {
    this.failures.push({ method, error, ...match });
  }

  /** Holds every getMessages call until the returned function is called. */
  holdMessages(): () => void {
    let open!: () => void;
    this.gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    return () => {
      this.gate = null;
      open();
    };
  }

  /** Holds postMessage calls until the returned function is called. */
  holdPost(): () => void {
    let open!: () => void;
    this.postGate = new Promise<void>((resolve) => {
      open = resolve;
    });
    return () => {
      this.postGate = null;
      open();
    };
  }

  callsOf(method: ApiMethod): ApiCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  messageCalls(chatId: number): ApiCall[] {
    return this.callsOf("getMessages").filter((call) => call.chatId === chatId);
  }

  async getChats(): Promise<ChatSnapshot[]> {
    await this.enter({ method: "getChats" });
    return this.chats.map((chat) => ({
      ...chat,
      members: chat.members.map((member) => ({ ...member })),
    }));
  }

  async getProfiles(): Promise<ProfileInput[]> {
    await this.enter({ method: "getProfiles" });
    return this.profiles.map((profile) => ({ ...profile }));
  }

  async getMessages(
    chatId: number,
    fromId: number,
  ): Promise<RawMessageInput[]> {
    await this.enter({ method: "getMessages", chatId, fromId });
    const list = this.messages.get(chatId);
    if (list === undefined) throw new ChatNotFoundError();
    return list
      .filter((message) => message.id > fromId)
      .map((message) => ({ ...message }));
  }

  async postMessage(
    chatId: number,
    text: string,
    important: boolean,
  ): Promise<void> {
    await this.enter({ method: "postMessage", chatId });
    const gate = this.postGate;
    if (gate !== null) await gate;
    this.postMessageCalls.push({ chatId, text, important });
  }

  private async enter(call: ApiCall): Promise<void> {
    this.calls.push(call);
    this.onCall?.(call);
    const gate = this.gate;
    if (call.method === "getMessages" && gate !== null) await gate;
    const failure = this.failures.find(
      (f) =>
        f.method === call.method &&
        (f.chatId === undefined || f.chatId === call.chatId) &&
        (f.fromId === undefined || f.fromId === call.fromId),
    );
    if (failure) throw failure.error;
  }
}

export const msg = (id: number, text = `m${id}`): RawMessageInput => ({
  id,
  userid: "abcdit01",
  userNick: "A",
  userFullname: null,
  userHash: null,
  serverTime: "2026-11-17_10-00-00",
  important: false,
  text,
  photoId: null,
  fileId: null,
  position: null,
});

export const snap = (
  id: number,
  overrides: Partial<ChatSnapshot> = {},
): ChatSnapshot => ({
  id,
  name: `Chat ${id}`,
  visibility: "private",
  directchat: false,
  role: "member",
  joined: true,
  ownerUserid: "owner",
  members: [],
  ...overrides,
});

export const profile = (userid: string, hash: string): ProfileInput => ({
  userid,
  hash,
  nickname: null,
  fullname: null,
});

/** Lets every pending microtask run (all fakes resolve without timers). */
export const flush = (): Promise<void> =>
  new Promise<void>((resolve) => setImmediate(resolve));
