import { and, asc, eq, lte, or } from "drizzle-orm";

import type { OutboxRepository } from "../ports";
import type { OutboxInput, OutboxRow } from "../types";
import { toOutboxRow } from "./mappers";
import { chats, outbox } from "./schema";
import type { SqliteDb } from "./types";

/**
 * SQLite implementation of `OutboxRepository`. Follows `SqliteMessageRepository`'s style:
 * explicit chat-existence check before `enqueue` (not only the FK error), and a transaction for
 * every operation that reads then writes.
 */
export class SqliteOutboxRepository implements OutboxRepository {
  constructor(private readonly db: SqliteDb) {}

  async listByChat(chatId: number): Promise<OutboxRow[]> {
    const rows = this.db
      .select()
      .from(outbox)
      .where(eq(outbox.chatId, chatId))
      .orderBy(asc(outbox.createdAt))
      .all();
    return rows.map(toOutboxRow);
  }

  async listDue(now: number): Promise<OutboxRow[]> {
    const rows = this.db
      .select()
      .from(outbox)
      .where(
        or(
          eq(outbox.status, "pending"),
          and(eq(outbox.status, "failed"), lte(outbox.nextRetryAt, now)),
        ),
      )
      .orderBy(asc(outbox.createdAt))
      .all();
    return rows.map(toOutboxRow);
  }

  async enqueue(
    input: OutboxInput,
    clientMessageId: string,
    now: number,
  ): Promise<OutboxRow> {
    return this.db.transaction((tx) => {
      const chat = tx
        .select()
        .from(chats)
        .where(eq(chats.id, input.chatId))
        .get();
      if (!chat) throw new Error(`FOREIGN KEY: unknown chat ${input.chatId}`);
      tx.insert(outbox)
        .values({
          clientMessageId,
          chatId: input.chatId,
          text: input.text,
          photoUri: input.photoUri,
          fileUri: input.fileUri,
          position: input.position,
          important: input.important,
          status: "pending",
          attempts: 0,
          nextRetryAt: null,
          lastError: null,
          createdAt: now,
        })
        .run();
      const row = tx
        .select()
        .from(outbox)
        .where(eq(outbox.clientMessageId, clientMessageId))
        .get();
      if (!row)
        throw new Error("Insert succeeded but the row cannot be read back");
      return toOutboxRow(row);
    });
  }

  async markSending(clientMessageId: string): Promise<void> {
    this.db
      .update(outbox)
      .set({ status: "sending" })
      .where(
        and(
          eq(outbox.clientMessageId, clientMessageId),
          eq(outbox.status, "pending"),
        ),
      )
      .run();
  }

  async markFailed(
    clientMessageId: string,
    error: string,
    nextRetryAt: number,
  ): Promise<void> {
    this.db.transaction((tx) => {
      const row = tx
        .select()
        .from(outbox)
        .where(eq(outbox.clientMessageId, clientMessageId))
        .get();
      if (!row) return;
      tx.update(outbox)
        .set({
          status: "failed",
          attempts: row.attempts + 1,
          lastError: error,
          nextRetryAt,
        })
        .where(eq(outbox.clientMessageId, clientMessageId))
        .run();
    });
  }

  async remove(clientMessageId: string): Promise<void> {
    this.db
      .delete(outbox)
      .where(eq(outbox.clientMessageId, clientMessageId))
      .run();
  }

  async resetStuckSending(): Promise<void> {
    this.db
      .update(outbox)
      .set({ status: "pending" })
      .where(eq(outbox.status, "sending"))
      .run();
  }
}
