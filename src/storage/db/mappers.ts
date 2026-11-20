import type { chats, chatMembers, profiles, rawMessages } from './schema';
import type { ChatRow, ProfileRow, RawMessage } from '../types';

/**
 * Row → domain mappers. They list every field explicitly so a schema change cannot silently
 * leak extra columns into the domain objects (the contracts compare with `toEqual`).
 */

type ChatRowDb = typeof chats.$inferSelect;
type MemberRowDb = typeof chatMembers.$inferSelect;
type ProfileRowDb = typeof profiles.$inferSelect;
type MessageRowDb = typeof rawMessages.$inferSelect;

export function toChatRow(row: ChatRowDb): ChatRow {
    return {
        id: row.id,
        name: row.name,
        visibility: row.visibility,
        directchat: row.directchat,
        role: row.role,
        joined: row.joined,
        ownerUserid: row.ownerUserid,
        firstSeenAt: row.firstSeenAt,
        missingSince: row.missingSince,
        syncedAt: row.syncedAt,
        polledUpTo: row.polledUpTo,
        lastPolledAt: row.lastPolledAt,
    };
}

export function toMemberRow(row: MemberRowDb): { userid: string; role: MemberRowDb['role'] } {
    return { userid: row.userid, role: row.role };
}

export function toProfileRow(row: ProfileRowDb): ProfileRow {
    return {
        userid: row.userid,
        hash: row.hash,
        nickname: row.nickname,
        fullname: row.fullname,
        fetchedAt: row.fetchedAt,
        missingSince: row.missingSince,
    };
}

export function toRawMessage(row: MessageRowDb): RawMessage {
    return {
        chatId: row.chatId,
        id: row.id,
        userid: row.userid,
        userNick: row.userNick,
        userFullname: row.userFullname,
        userHash: row.userHash,
        serverTime: row.serverTime,
        important: row.important,
        text: row.text,
        photoId: row.photoId,
        fileId: row.fileId,
        position: row.position,
        receivedAt: row.receivedAt,
    };
}
