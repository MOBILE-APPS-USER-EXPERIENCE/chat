import type { ChatRow, ProfileRow, RawMessage } from '../types';

export type MemberRow = { userid: string; role: 'owner' | 'member' | 'invited' };

export class MemoryDb {
    chats = new Map<number, ChatRow>();
    members = new Map<number, MemberRow[]>();
    messages = new Map<number, Map<number, RawMessage>>();
    profiles = new Map<string, ProfileRow>();
}
