import { and, asc, eq, isNull } from 'drizzle-orm';

import { toChatRow, toMemberRow } from './mappers';
import { chatMembers, chats } from './schema';
import type { SqliteDb } from './types';
import type { ChatRepository } from '../ports';
import type { ChatRow, ChatSnapshot, MemberRole } from '../types';

/**
 * SQLite implementation of `ChatRepository` on the sync Drizzle driver.
 *
 * `chats` rows are only ever upserted, never replaced: `INSERT OR REPLACE` would delete the
 * parent row and cascade to `chat_members` and `raw_messages`. Local-only fields
 * (`firstSeenAt`, `polledUpTo`, `lastPolledAt`) are never part of the conflict update.
 */
export class SqliteChatRepository implements ChatRepository {
    constructor(private readonly db: SqliteDb) { }

    async list(filter?: { joined?: boolean }): Promise<ChatRow[]> {
        const rows = this.db
            .select()
            .from(chats)
            .where(filter?.joined === undefined ? undefined : eq(chats.joined, filter.joined))
            .orderBy(asc(chats.id))
            .all();
        return rows.map(toChatRow);
    }

    async get(id: number) {
        const row = this.db.select().from(chats).where(eq(chats.id, id)).get();
        return row ? toChatRow(row) : null;
    }

    async listMembers(chatId: number) {
        const rows = this.db
            .select()
            .from(chatMembers)
            .where(eq(chatMembers.chatId, chatId))
            .orderBy(asc(chatMembers.userid))
            .all();
        return rows.map(toMemberRow);
    }

    async applySnapshot(snapshots: ChatSnapshot[], now: number) {
        // Duplicate chat ids and duplicate member userids: the last one wins.
        const byId = new Map<number, ChatSnapshot>();
        for (const snapshot of snapshots) {
            const members = new Map<string, { userid: string; role: MemberRole }>();
            for (const member of snapshot.members) {
                members.set(member.userid, { ...member });
            }
            byId.set(snapshot.id, { ...snapshot, members: [...members.values()] });
        }

        this.db.transaction(tx => {
            for (const snapshot of byId.values()) {
                tx.insert(chats)
                    .values({
                        id: snapshot.id,
                        name: snapshot.name,
                        visibility: snapshot.visibility,
                        directchat: snapshot.directchat,
                        role: snapshot.role,
                        joined: snapshot.joined,
                        ownerUserid: snapshot.ownerUserid,
                        firstSeenAt: now,
                        missingSince: null,
                        syncedAt: now,
                        polledUpTo: 0,
                        lastPolledAt: null,
                    })
                    .onConflictDoUpdate({
                        target: chats.id,
                        // Snapshot fields only: local fields survive the re-apply.
                        set: {
                            name: snapshot.name,
                            visibility: snapshot.visibility,
                            directchat: snapshot.directchat,
                            role: snapshot.role,
                            joined: snapshot.joined,
                            ownerUserid: snapshot.ownerUserid,
                            syncedAt: now,
                            missingSince: null,
                        },
                    })
                    .run();

                tx.delete(chatMembers).where(eq(chatMembers.chatId, snapshot.id)).run();
                for (const member of snapshot.members) {
                    tx.insert(chatMembers)
                        .values({ chatId: snapshot.id, userid: member.userid, role: member.role })
                        .run();
                }
            }

            // Mark stored chats that the snapshot omits as missing. Computed in JS so an empty
            // snapshot works and no huge `NOT IN (...)` list is built.
            const present = [...byId.keys()];
            const storedIds = tx.select({ id: chats.id }).from(chats).all().map(row => row.id);
            const missing = storedIds.filter(id => !present.includes(id));
            for (const id of missing) {
                tx.update(chats)
                    .set({ missingSince: now })
                    .where(and(eq(chats.id, id), isNull(chats.missingSince)))
                    .run();
            }
        });
    }

    async purge(chatId: number) {
        this.db.transaction(tx => {
            tx.delete(chats).where(eq(chats.id, chatId)).run();
        });
    }
}
