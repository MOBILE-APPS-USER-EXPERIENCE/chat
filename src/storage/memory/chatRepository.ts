import type { ChatRepository } from "../ports";
import type { ChatRow, MemberRole } from "../types";
import { MemoryDb } from "./memoryStorage";

export class MemoryChatRepository implements ChatRepository {
  constructor(private readonly db: MemoryDb) {}

  async list(filter?: { joined?: boolean }): Promise<ChatRow[]> {
    return [...this.db.chats.values()]
      .filter(
        (chat) => filter?.joined === undefined || chat.joined === filter.joined,
      )
      .sort((a, b) => a.id - b.id)
      .map((chat) => ({ ...chat }));
  }

  async get(id: number): Promise<ChatRow | null> {
    const chat = this.db.chats.get(id);
    return chat ? { ...chat } : null;
  }

  async listMembers(chatId: number) {
    return (
      (this.db.members.get(chatId) ?? [])
        .map((member) => ({ ...member }))
        // Plain code-unit comparison, matching `ORDER BY userid` in SQLite (BINARY collation).
        .sort((a, b) =>
          a.userid < b.userid ? -1 : a.userid > b.userid ? 1 : 0,
        )
    );
  }

  async applySnapshot(
    snapshots: Parameters<ChatRepository["applySnapshot"]>[0],
    now: number,
  ) {
    const present = new Set<number>();
    for (const snapshot of snapshots) {
      present.add(snapshot.id);
      const existing = this.db.chats.get(snapshot.id);
      const row: ChatRow = {
        id: snapshot.id,
        name: snapshot.name,
        visibility: snapshot.visibility,
        directchat: snapshot.directchat,
        role: snapshot.role,
        joined: snapshot.joined,
        ownerUserid: snapshot.ownerUserid,
        firstSeenAt: existing?.firstSeenAt ?? now,
        missingSince: null,
        syncedAt: now,
        polledUpTo: existing?.polledUpTo ?? 0,
        lastPolledAt: existing?.lastPolledAt ?? null,
      };
      this.db.chats.set(snapshot.id, { ...row });
      // Duplicate userids within one chat: the last one wins, one row per (chatId, userid).
      const members = new Map<string, { userid: string; role: MemberRole }>();
      for (const member of snapshot.members) {
        members.set(member.userid, { ...member });
      }
      this.db.members.set(snapshot.id, [...members.values()]);
    }
    for (const [id, chat] of this.db.chats) {
      if (!present.has(id) && chat.missingSince === null) {
        chat.missingSince = now;
      }
    }
  }

  async purge(chatId: number) {
    this.db.chats.delete(chatId);
    this.db.members.delete(chatId);
    this.db.messages.delete(chatId);
    for (const [id, row] of this.db.outbox) {
      if (row.chatId === chatId) this.db.outbox.delete(id);
    }
  }
}
