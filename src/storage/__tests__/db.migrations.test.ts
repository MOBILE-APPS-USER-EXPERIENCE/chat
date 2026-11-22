/**
 * @jest-environment node
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';

/**
 * Runs the same migration folder the app bundle uses (`src/storage/db/migrations`) against an
 * in-memory better-sqlite3 database. The app applies it through Drizzle's Expo migrator, which
 * reads the same `.sql` files and the same `meta/_journal.json`.
 */

const MIGRATIONS_FOLDER = path.join(__dirname, '..', 'db', 'migrations');

type Sqlite = InstanceType<typeof Database>;

function openMigrated(): { sqlite: Sqlite; db: ReturnType<typeof drizzle> } {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    return { sqlite, db };
}

function tableNames(sqlite: Sqlite): string[] {
    return sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((row) => (row as { name: string }).name);
}

function columnsOf(sqlite: Sqlite, table: string): { name: string; notnull: number; pk: number }[] {
    return sqlite.prepare(`PRAGMA table_info(${table})`).all() as {
        name: string;
        notnull: number;
        pk: number;
    }[];
}

function insertChat(sqlite: Sqlite, id: number): void {
    sqlite
        .prepare(
            `INSERT INTO chats (id, name, visibility, role, joined, first_seen_at, synced_at)
             VALUES (?, ?, 'public', 'member', 1, 1, 1)`,
        )
        .run(id, `chat ${id}`);
}

function insertMessage(sqlite: Sqlite, chatId: number, id: number, userid = 'alice'): void {
    sqlite
        .prepare(
            `INSERT INTO raw_messages (chat_id, id, userid, received_at) VALUES (?, ?, ?, 1)`,
        )
        .run(chatId, id, userid);
}

describe('account database migrations', () => {
    it('creates the four tables on an empty database', () => {
        const { sqlite } = openMigrated();
        expect(tableNames(sqlite)).toEqual(
            expect.arrayContaining(['chat_members', 'chats', 'profiles', 'raw_messages']),
        );
        sqlite.close();
    });

    it('is idempotent: applying the migrations twice changes nothing', () => {
        const { sqlite, db } = openMigrated();
        const before = tableNames(sqlite);
        const appliedBefore = sqlite.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get();

        migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

        expect(tableNames(sqlite)).toEqual(before);
        expect(sqlite.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get()).toEqual(
            appliedBefore,
        );
        sqlite.close();
    });

    it('declares the expected columns and NOT NULL constraints', () => {
        const { sqlite } = openMigrated();

        const chats = columnsOf(sqlite, 'chats');
        expect(chats.map((column) => column.name)).toEqual([
            'id', 'name', 'visibility', 'directchat', 'role', 'joined', 'owner_userid',
            'first_seen_at', 'missing_since', 'synced_at', 'polled_up_to', 'last_polled_at',
        ]);
        const notNull = (table: string, column: string) =>
            columnsOf(sqlite, table).find((entry) => entry.name === column)?.notnull;
        expect(notNull('chats', 'synced_at')).toBe(1);
        expect(notNull('chats', 'owner_userid')).toBe(0);
        expect(notNull('profiles', 'fetched_at')).toBe(1);
        expect(notNull('raw_messages', 'received_at')).toBe(1);

        sqlite.close();
    });

    it('uses composite primary keys for chat_members and raw_messages', () => {
        const { sqlite } = openMigrated();

        const pkColumns = (table: string) =>
            columnsOf(sqlite, table)
                .filter((column) => column.pk > 0)
                .sort((a, b) => a.pk - b.pk)
                .map((column) => column.name);

        expect(pkColumns('chats')).toEqual(['id']);
        expect(pkColumns('profiles')).toEqual(['userid']);
        expect(pkColumns('chat_members')).toEqual(['chat_id', 'userid']);
        expect(pkColumns('raw_messages')).toEqual(['chat_id', 'id']);

        sqlite.close();
    });

    it('has a unique index on profiles.hash', () => {
        const { sqlite } = openMigrated();

        const indexes = sqlite.prepare('PRAGMA index_list(profiles)').all() as {
            name: string;
            unique: number;
        }[];
        const uniqueIndex = indexes.find((index) => index.unique === 1);
        expect(uniqueIndex).toBeDefined();
        const indexedColumns = (
            sqlite.prepare(`PRAGMA index_info(${uniqueIndex?.name})`).all() as { name: string }[]
        ).map((column) => column.name);
        expect(indexedColumns).toEqual(['hash']);

        sqlite.close();
    });

    it('cascades a chat delete to chat_members and raw_messages', () => {
        const { sqlite } = openMigrated();
        insertChat(sqlite, 1);
        sqlite.prepare("INSERT INTO chat_members (chat_id, userid, role) VALUES (1, 'alice', 'owner')").run();
        insertMessage(sqlite, 1, 10);

        sqlite.prepare('DELETE FROM chats WHERE id = 1').run();

        expect(sqlite.prepare('SELECT count(*) AS n FROM chat_members').get()).toEqual({ n: 0 });
        expect(sqlite.prepare('SELECT count(*) AS n FROM raw_messages').get()).toEqual({ n: 0 });
        sqlite.close();
    });

    it('rejects a message for an unknown chat', () => {
        const { sqlite } = openMigrated();
        expect(() => insertMessage(sqlite, 999, 1)).toThrow(/FOREIGN KEY/i);
        sqlite.close();
    });

    it('accepts a message whose userid has no profile (soft reference)', () => {
        const { sqlite } = openMigrated();
        insertChat(sqlite, 1);
        expect(() => insertMessage(sqlite, 1, 1, 'nobody')).not.toThrow();
        expect(sqlite.prepare('SELECT count(*) AS n FROM raw_messages').get()).toEqual({ n: 1 });
        sqlite.close();
    });

    it('does not overwrite an existing message with INSERT OR IGNORE', () => {
        const { sqlite } = openMigrated();
        insertChat(sqlite, 1);
        sqlite
            .prepare("INSERT INTO raw_messages (chat_id, id, userid, text, received_at) VALUES (1, 5, 'alice', 'first', 1)")
            .run();

        sqlite
            .prepare("INSERT OR IGNORE INTO raw_messages (chat_id, id, userid, text, received_at) VALUES (1, 5, 'bob', 'second', 2)")
            .run();

        expect(sqlite.prepare('SELECT userid, text FROM raw_messages WHERE chat_id = 1 AND id = 5').get())
            .toEqual({ userid: 'alice', text: 'first' });
        sqlite.close();
    });

    it('rolls back a transaction that throws halfway', () => {
        const { sqlite } = openMigrated();
        insertChat(sqlite, 1);

        const failing = sqlite.transaction(() => {
            insertMessage(sqlite, 1, 1);
            insertMessage(sqlite, 1, 2);
            throw new Error('boom');
        });

        expect(() => failing()).toThrow('boom');
        expect(sqlite.prepare('SELECT count(*) AS n FROM raw_messages').get()).toEqual({ n: 0 });
        sqlite.close();
    });
});
