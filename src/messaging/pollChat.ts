import type { ChatRepository, MessageRepository } from '../storage/ports';
import type { RawMessage, RawMessageInput } from '../storage/types';
import { ChatNotFoundError } from './errors';
import type { PollResult, SyncApi } from './ports';

export type PollDeps = {
    api: Pick<SyncApi, 'getMessages'>;
    chats: ChatRepository;
    messages: MessageRepository;
    now: () => number;
    /** Checked after every await that precedes a write; false means "discard and abort". */
    isCurrent: () => boolean;
};

const SKIPPED: PollResult = { status: 'skipped' };
const ABORTED: PollResult = { status: 'aborted' };
const NOT_FOUND: PollResult = { status: 'chat_not_found' };

/**
 * Stable fields only. usernick, userfullname and userhash are resolved by the server at read
 * time and may change legitimately, so they must never trigger a (destructive) reset.
 */
function sameMessage(a: RawMessage, b: RawMessageInput): boolean {
    return a.userid === b.userid && a.text === b.text && a.serverTime === b.serverTime
        && a.photoId === b.photoId && a.fileId === b.fileId;
}

/** Returns null when the server answers "chat does not exist". */
async function fetchMessages(deps: PollDeps, chatId: number, fromId: number): Promise<RawMessageInput[] | null> {
    try {
        return await deps.api.getMessages(chatId, fromId);
    } catch (error) {
        if (error instanceof ChatNotFoundError) return null;
        throw error;
    }
}

/**
 * Polls one chat with `fromid = max(cursor - 1, 0)`. The message returned with `id == cursor`
 * is an overlap check: if its content differs from the stored one, the chat was recreated and
 * the local copy is rebuilt. An empty result, or a first message with `id > cursor` (the cursor
 * message was deleted on the server), keeps all local data and only appends. Never purges.
 */
export async function pollChat(chatId: number, deps: PollDeps): Promise<PollResult> {
    const chat = await deps.chats.get(chatId);
    if (chat === null || !chat.joined) return SKIPPED;
    if (!deps.isCurrent()) return ABORTED;

    const cursor = chat.polledUpTo;
    const incoming = await fetchMessages(deps, chatId, Math.max(cursor - 1, 0));
    if (!deps.isCurrent()) return ABORTED;
    if (incoming === null) return NOT_FOUND;

    const overlap = cursor > 0 ? incoming.find(message => message.id === cursor) : undefined;
    if (overlap !== undefined) {
        const stored = await deps.messages.get(chatId, cursor);
        if (!deps.isCurrent()) return ABORTED;
        if (stored !== null && !sameMessage(stored, overlap)) return rebuildChat(chatId, deps);
    }

    const appended = await deps.messages.appendBatch(chatId, incoming, deps.now());
    return { status: 'ok', inserted: appended.inserted };
}

/** Fetches everything first, so a failing request changes nothing. */
async function rebuildChat(chatId: number, deps: PollDeps): Promise<PollResult> {
    const all = await fetchMessages(deps, chatId, 0);
    if (!deps.isCurrent()) return ABORTED;
    if (all === null) return NOT_FOUND;

    await deps.messages.resetChat(chatId);
    if (!deps.isCurrent()) return ABORTED;
    const appended = await deps.messages.appendBatch(chatId, all, deps.now());
    return { status: 'reset', inserted: appended.inserted };
}
