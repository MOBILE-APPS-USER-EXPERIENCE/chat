import type { ChatRepository, MessageRepository } from '../storage/ports';
import type { RawMessage, RawMessageInput } from '../storage/types';

export class ChatNotFoundError extends Error { }   // adapter maps ApiError 458 to this

export interface MessageApi {
    getMessages(chatId: number, fromId: number): Promise<RawMessageInput[]>;
}

export type PollResult =
    | { status: 'skipped' }                       // unknown chat or not joined
    | { status: 'ok'; inserted: number }
    | { status: 'reset'; inserted: number }       // content mismatch, local copy rebuilt
    | { status: 'chat_not_found' };               // 458: caller decides about purge

type Deps = {
    api: MessageApi;
    chats: ChatRepository;
    messages: MessageRepository;
    now: () => number;
};

function sameMessage(a: RawMessage, b: RawMessageInput): boolean {
    return a.userid === b.userid && a.text === b.text && a.serverTime === b.serverTime
        && a.photoId === b.photoId && a.fileId === b.fileId;
}

export async function pollChat(chatId: number, d: Deps): Promise<PollResult> {
    const chat = await d.chats.get(chatId);
    if (!chat?.joined) return { status: 'skipped' };

    const cursor = chat.polledUpTo;
    let incoming: RawMessageInput[];
    try {
        incoming = await d.api.getMessages(chatId, Math.max(cursor - 1, 0));
    } catch (e) {
        if (e instanceof ChatNotFoundError) return { status: 'chat_not_found' };
        throw e;
    }

    if (cursor > 0 && incoming[0]?.id === cursor) {
        const stored = await d.messages.get(chatId, cursor);
        if (stored && !sameMessage(stored, incoming[0])) {
            await d.messages.resetChat(chatId);
            const all = await d.api.getMessages(chatId, 0);
            const res = await d.messages.appendBatch(chatId, all, d.now());
            return { status: 'reset', inserted: res.inserted };
        }
    }

    const res = await d.messages.appendBatch(chatId, incoming, d.now());
    return { status: 'ok', inserted: res.inserted };
}
