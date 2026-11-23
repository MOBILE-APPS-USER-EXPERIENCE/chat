import type { OutboxRepository } from "../ports";
import type { OutboxInput, OutboxRow } from "../types";
import { MemoryDb } from "./memoryStorage";

export class MemoryOutboxRepository implements OutboxRepository {
  constructor(private readonly db: MemoryDb) {}

  async listByChat(chatId: number): Promise<OutboxRow[]> {
    return [...this.db.outbox.values()]
      .filter((row) => row.chatId === chatId)
      .sort((a, b) =>
        a.createdAt - b.createdAt ||
        [...this.db.outbox.keys()].indexOf(a.clientMessageId) -
          [...this.db.outbox.keys()].indexOf(b.clientMessageId),
      )
      .map((row) => ({ ...row }));
  }

  async listDue(now: number): Promise<OutboxRow[]> {
    return [...this.db.outbox.values()]
      .filter(
        (row) =>
          row.status === "pending" ||
          (row.status === "failed" &&
            row.nextRetryAt !== null &&
            row.nextRetryAt <= now),
      )
      .sort((a, b) =>
        a.createdAt - b.createdAt ||
        [...this.db.outbox.keys()].indexOf(a.clientMessageId) -
          [...this.db.outbox.keys()].indexOf(b.clientMessageId),
      )
      .map((row) => ({ ...row }));
  }

  async listBlockedChatIds(now: number): Promise<number[]> {
    const chatIds = new Set<number>();
    for (const row of this.db.outbox.values()) {
      if (
        row.status === "sending" ||
        (row.status === "failed" &&
          row.nextRetryAt !== null &&
          row.nextRetryAt > now)
      ) {
        chatIds.add(row.chatId);
      }
    }
    return [...chatIds];
  }

  async enqueue(
    input: OutboxInput,
    clientMessageId: string,
    now: number,
  ): Promise<OutboxRow> {
    if (!this.db.chats.has(input.chatId))
      throw new Error(`FOREIGN KEY: unknown chat ${input.chatId}`);
    const row: OutboxRow = {
      ...input,
      clientMessageId,
      status: "pending",
      attempts: 0,
      nextRetryAt: null,
      lastError: null,
      createdAt: now,
    };
    this.db.outbox.set(clientMessageId, row);
    return { ...row };
  }

  async markSending(clientMessageId: string): Promise<boolean> {
    const row = this.db.outbox.get(clientMessageId);
    if (!row || (row.status !== "pending" && row.status !== "failed")) return false;
    row.status = "sending";
    return true;
  }

  async markFailed(
    clientMessageId: string,
    error: string,
    nextRetryAt: number,
  ): Promise<void> {
    const row = this.db.outbox.get(clientMessageId);
    if (!row) return;
    row.status = "failed";
    row.attempts += 1;
    row.lastError = error;
    row.nextRetryAt = nextRetryAt;
  }

  async remove(clientMessageId: string): Promise<void> {
    this.db.outbox.delete(clientMessageId);
  }

  async discard(clientMessageId: string): Promise<OutboxRow | null> {
    const row = this.db.outbox.get(clientMessageId);
    if (!row || row.status === "sending") return null;
    this.db.outbox.delete(clientMessageId);
    return { ...row };
  }

  async resetStuckSending(): Promise<void> {
    for (const row of this.db.outbox.values()) {
      if (row.status === "sending") row.status = "pending";
    }
  }
}
