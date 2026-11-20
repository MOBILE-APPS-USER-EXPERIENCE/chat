import type { ChatRole, ChatSnapshot, MemberRole, RawMessageInput } from '../storage/types';
import { InvalidServerDataError } from './errors';
import type { ProfileInput } from './ports';

/**
 * Pure mappers from raw server JSON to domain input types. Input is `unknown` on purpose: the
 * data is untrusted, and only `apiAdapter.ts` may import `src/api`. Error messages name the
 * field, never the value. Userids are lowercased here (repositories never normalize).
 */

type Wire = Readonly<Record<string, unknown>>;

const CHAT_ROLES: readonly ChatRole[] = ['owner', 'member', 'invited', 'admin', 'none'];

function invalid(what: string): InvalidServerDataError {
    return new InvalidServerDataError(`Invalid server data: ${what}`);
}

function isWire(value: unknown): value is Wire {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireWire(value: unknown, what: string): Wire {
    if (!isWire(value)) throw invalid(what);
    return value;
}

function requireArray(value: unknown, what: string): readonly unknown[] {
    if (!Array.isArray(value)) throw invalid(what);
    return value;
}

function requireUserid(entry: Wire, what: string): string {
    const userid = entry.userid;
    if (typeof userid !== 'string' || userid === '') throw invalid(`${what}.userid`);
    return userid.toLowerCase();
}

/** Missing, undefined and null become null; anything else must be a string. */
function optionalString(entry: Wire, key: string, what: string): string | null {
    const value = entry[key];
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') throw invalid(`${what}.${key}`);
    return value;
}

function toStrictBoolean(value: unknown): boolean {
    return value === true || value === 1 || value === 'true' || value === '1';
}

function toChatRole(value: unknown): ChatRole {
    return CHAT_ROLES.find(role => role === value) ?? 'none';
}

function readOwner(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (Array.isArray(value)) {
        if (value.length === 0) return null;
        throw invalid('chat.owner');
    }
    return requireUserid(requireWire(value, 'chat.owner'), 'chat.owner');
}

function readUsers(value: unknown, what: string): string[] {
    if (value === undefined || value === null) return [];
    return requireArray(value, what).map(entry => requireUserid(requireWire(entry, what), what));
}

/** One entry per userid; precedence owner > member > invited. */
function buildMembers(
    owner: string | null, participants: string[], invited: string[],
): { userid: string; role: MemberRole }[] {
    const roles = new Map<string, MemberRole>();
    if (owner !== null) roles.set(owner, 'owner');
    for (const userid of participants) {
        if (!roles.has(userid)) roles.set(userid, 'member');
    }
    for (const userid of invited) {
        if (!roles.has(userid)) roles.set(userid, 'invited');
    }
    return [...roles].map(([userid, role]) => ({ userid, role }));
}

export function toChatSnapshot(chat: unknown): ChatSnapshot {
    const raw = requireWire(chat, 'chat');
    const id = raw.chatid;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0) throw invalid('chat.chatid');
    const name = raw.chatname;
    if (typeof name !== 'string') throw invalid('chat.chatname');
    const visibility = raw.visibility;
    if (visibility !== 'public' && visibility !== 'private') throw invalid('chat.visibility');

    const ownerUserid = readOwner(raw.owner);
    const participants = readUsers(raw.participants, 'chat.participants');
    const invited = readUsers(raw.invited, 'chat.invited');
    return {
        id,
        name,
        visibility,
        directchat: raw.directchat === true,
        role: toChatRole(raw.role),
        joined: raw.joined === true,
        ownerUserid,
        // The main chat has no members, whatever the server sends.
        members: id === 0 ? [] : buildMembers(ownerUserid, participants, invited),
    };
}

/** The whole payload is rejected when one chat is invalid. */
export function toChatSnapshots(chats: unknown): ChatSnapshot[] {
    return requireArray(chats, 'chats').map(chat => toChatSnapshot(chat));
}

export function toProfileInput(user: unknown): ProfileInput {
    const raw = requireWire(user, 'profile');
    const hash = raw.hash;
    if (typeof hash !== 'string' || hash === '') throw invalid('profile.hash');
    const displayName = (value: unknown): string | null =>
        typeof value === 'string' && value !== '' ? value : null;
    return {
        userid: requireUserid(raw, 'profile'),
        hash,
        nickname: displayName(raw.nickname),
        fullname: displayName(raw.fullname),
    };
}

/** Invalid entries are dropped individually and counted; a non-array payload is rejected. */
export function toProfileInputs(users: unknown): { profiles: ProfileInput[]; dropped: number } {
    const profiles: ProfileInput[] = [];
    let dropped = 0;
    for (const entry of requireArray(users, 'profiles')) {
        try {
            profiles.push(toProfileInput(entry));
        } catch (error) {
            if (!(error instanceof InvalidServerDataError)) throw error;
            dropped += 1;   // reported to the caller, see createSyncApi
        }
    }
    return { profiles, dropped };
}

export function toRawMessageInput(message: unknown): RawMessageInput {
    const raw = requireWire(message, 'message');
    const id = raw.id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) throw invalid('message.id');
    return {
        id,
        userid: requireUserid(raw, 'message'),
        userNick: optionalString(raw, 'usernick', 'message'),
        userFullname: optionalString(raw, 'userfullname', 'message'),
        userHash: optionalString(raw, 'userhash', 'message'),
        serverTime: optionalString(raw, 'time', 'message'),
        important: toStrictBoolean(raw.important),
        // The text is stored exactly as received: no entity decoding, no trimming.
        text: optionalString(raw, 'text', 'message'),
        photoId: optionalString(raw, 'photoid', 'message'),
        fileId: optionalString(raw, 'fileid', 'message'),
        position: optionalString(raw, 'position', 'message'),
    };
}

/** Ascending by server id. The whole payload is rejected when one message is invalid. */
export function toRawMessageInputs(messages: unknown): RawMessageInput[] {
    return requireArray(messages, 'messages')
        .map(message => toRawMessageInput(message))
        .sort((a, b) => a.id - b.id);
}
