import { and, count, desc, eq, gt, lt } from 'drizzle-orm';

import { toRawMessage } from './mappers';
import { chats, rawMessages } from './schema';
import type { SqliteDb } from './types';
import type { MessageRepository } from '../ports';
import type { RawMessageInput } from '../types';

/** 13 columns per row; keep well below SQLite's 999 bound-variable limit. */
const INSERT_CHUNK = 50;

/**
 * SQLite implementation of `MessageRepository`. Inserts use `ON CONFLICT DO NOTHING`, so the
 * first duplicate id wins and is counted once; the cursor update runs in the same transaction.
 */
export class SqliteMessageRepository implements MessageRepository {
    constructor(private readonly db: SqliteDb) { }

    async get(chatId: number, id: number) {
        const row = this.db.select()
            .from(rawMessages)
            .where(and(eq(rawMessages.chatId, chatId), eq(rawMessages.id, id)))
            .get();
        return row ? toRawMessage(row) : null;
    }

    async listPage(chatId: number, opts: { beforeId?: number; limit: number }) {
        if (!Number.isInteger(opts.limit) || opts.limit <= 0) {
            throw new RangeError(`limit must be a positive integer, got ${opts.limit}`);
        }
        const rows = this.db.select()
            .from(rawMessages)
            .where(and(
                eq(rawMessages.chatId, chatId),
                opts.beforeId === undefined ? undefined : lt(rawMessages.id, opts.beforeId),
            ))
            .orderBy(desc(rawMessages.id))
            .limit(opts.limit)
            .all();
        return rows.map(toRawMessage);
    }

    async countAfter(chatId: number, afterId: number) {
        const row = this.db.select({ value: count() })
            .from(rawMessages)
            .where(and(eq(rawMessages.chatId, chatId), gt(rawMessages.id, afterId)))
            .get();
        return row?.value ?? 0;
    }

    async appendBatch(chatId: number, msgs: RawMessageInput[], now: number) {
        return this.db.transaction(tx => {
            // Explicit existence check: do not rely on the FK error alone, and never touch
            // anything when the chat is unknown (even for an empty batch).
            const chat = tx.select().from(chats).where(eq(chats.id, chatId)).get();
            if (!chat) throw new Error(`FOREIGN KEY: unknown chat ${chatId}`);

            let inserted = 0;
            for (let start = 0; start < msgs.length; start += INSERT_CHUNK) {
                const chunk = msgs.slice(start, start + INSERT_CHUNK);
                const returned = tx.insert(rawMessages)
                    .values(chunk.map(message => ({
                        chatId,
                        id: message.id,
                        userid: message.userid,
                        userNick: message.userNick,
                        userFullname: message.userFullname,
                        userHash: message.userHash,
                        serverTime: message.serverTime,
                        important: message.important,
                        text: message.text,
                        photoId: message.photoId,
                        fileId: message.fileId,
                        position: message.position,
                        receivedAt: now,
                    })))
                    .onConflictDoNothing()
                    .returning({ id: rawMessages.id })
                    .all();
                inserted += returned.length;
            }

            // The cursor covers every id in the batch, inserted or not, and never moves back.
            const maxId = msgs.reduce((max, message) => Math.max(max, message.id), 0);
            const polledUpTo = Math.max(chat.polledUpTo, maxId);
            tx.update(chats)
                .set({ polledUpTo, lastPolledAt: now })
                .where(eq(chats.id, chatId))
                .run();
            return { inserted, polledUpTo };
        });
    }

    async resetChat(chatId: number) {
        this.db.transaction(tx => {
            const chat = tx.select().from(chats).where(eq(chats.id, chatId)).get();
            if (!chat) return;
            tx.delete(rawMessages).where(eq(rawMessages.chatId, chatId)).run();
            tx.update(chats).set({ polledUpTo: 0 }).where(eq(chats.id, chatId)).run();
        });
    }
}
