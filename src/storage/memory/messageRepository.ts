import type { MessageRepository } from '../ports';
import type { RawMessage, RawMessageInput } from '../types';
import { MemoryDb } from './memoryStorage';

export class MemoryMessageRepository implements MessageRepository {
    constructor(private readonly db: MemoryDb) { }

    async get(chatId: number, id: number) {
        const message = this.db.messages.get(chatId)?.get(id);
        return message ? { ...message } : null;
    }

    async listPage(chatId: number, opts: { beforeId?: number; limit: number }) {
        if (!Number.isInteger(opts.limit) || opts.limit <= 0) {
            throw new RangeError(`limit must be a positive integer, got ${opts.limit}`);
        }
        return [...(this.db.messages.get(chatId)?.values() ?? [])]
            .filter(message => opts.beforeId === undefined || message.id < opts.beforeId)
            .sort((a, b) => b.id - a.id)
            .slice(0, opts.limit)
            .map(message => ({ ...message }));
    }

    async countAfter(chatId: number, afterId: number) {
        return [...(this.db.messages.get(chatId)?.values() ?? [])]
            .filter(message => message.id > afterId).length;
    }

    async appendBatch(chatId: number, msgs: RawMessageInput[], now: number) {
        const chat = this.db.chats.get(chatId);
        if (!chat) throw new Error(`FOREIGN KEY: unknown chat ${chatId}`);
        const bucket = this.db.messages.get(chatId) ?? new Map<number, RawMessage>();
        this.db.messages.set(chatId, bucket);
        let inserted = 0;
        let polledUpTo = chat.polledUpTo;
        for (const message of msgs) {
            if (!bucket.has(message.id)) {
                bucket.set(message.id, { ...message, chatId, receivedAt: now });
                inserted++;
            }
            polledUpTo = Math.max(polledUpTo, message.id);
        }
        chat.polledUpTo = polledUpTo;
        chat.lastPolledAt = now;
        return { inserted, polledUpTo };
    }

    async resetChat(chatId: number) {
        this.db.messages.delete(chatId);
        const chat = this.db.chats.get(chatId);
        if (chat) chat.polledUpTo = 0;
    }
}
