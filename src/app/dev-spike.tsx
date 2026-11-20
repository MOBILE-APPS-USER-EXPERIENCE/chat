import { eq, sql } from 'drizzle-orm';
import { useState } from 'react';
import { Button, H2, ScrollView, Text, XStack, YStack } from 'tamagui';

import { Spacing } from '@/constants/layout';
import { accountStorage, getStorageStatus } from '@/storage/accountStorage';
import { deleteAccountDatabase, openAccountDatabase } from '@/storage/db/openDatabase';
import { chats, rawMessages } from '@/storage/db/schema';

/**
 * Temporary dev-only spike for the SQLite + Drizzle decision (ADR-005). Not linked from the app.
 * It is the manual test surface for the checklist in the ADR.
 */

const SPIKE_ACCOUNT_ID = 'spike';
const SPIKE_REPO_ACCOUNT_ID = 'spike-repo';

type Capabilities = {
    crossOriginIsolated: boolean | null;
    isSecureContext: boolean | null;
    sharedArrayBuffer: string;
    persist: string;
};

function readCapabilities(): Capabilities {
    const globalScope = globalThis as {
        crossOriginIsolated?: boolean;
        isSecureContext?: boolean;
        SharedArrayBuffer?: unknown;
    };
    return {
        crossOriginIsolated: globalScope.crossOriginIsolated ?? null,
        isSecureContext: globalScope.isSecureContext ?? null,
        sharedArrayBuffer: typeof globalScope.SharedArrayBuffer,
        persist: 'unavailable',
    };
}

async function readPersist(): Promise<string> {
    const storage = (globalThis as { navigator?: { storage?: { persist?: () => Promise<boolean> } } })
        .navigator?.storage;
    if (!storage?.persist) return 'unavailable';
    try {
        return String(await storage.persist());
    } catch (error) {
        return `error: ${error instanceof Error ? error.message : String(error)}`;
    }
}

function countOf(db: Awaited<ReturnType<typeof openAccountDatabase>>['db'], table: typeof chats | typeof rawMessages): number {
    const row = db.select({ value: sql<number>`count(*)` }).from(table).get();
    return row?.value ?? 0;
}

export default function DevSpikeScreen() {
    const [output, setOutput] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);

    if (!__DEV__) return null;

    function log(line: string) {
        setOutput((previous) => [...previous, line]);
    }

    async function run(label: string, action: () => Promise<string>) {
        setBusy(true);
        try {
            log(`${label}: ${await action()}`);
        } catch (error) {
            log(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setBusy(false);
        }
    }

    function openAndMigrate() {
        return run('Open + migrate', async () => {
            const started = Date.now();
            const { close } = await openAccountDatabase(SPIKE_ACCOUNT_ID);
            const elapsed = Date.now() - started;
            await close();
            return `ok in ${elapsed} ms (driver: expo-sqlite sync via drizzle-orm/expo-sqlite)`;
        });
    }

    function write() {
        return run('Write', async () => {
            const { db, close } = await openAccountDatabase(SPIKE_ACCOUNT_ID);
            try {
                const now = Date.now();
                db.transaction((tx) => {
                    tx.insert(chats)
                        .values({
                            id: 1,
                            name: 'Spike chat',
                            visibility: 'public',
                            role: 'member',
                            joined: true,
                            firstSeenAt: now,
                            syncedAt: now,
                        })
                        .onConflictDoUpdate({ target: chats.id, set: { syncedAt: now } })
                        .run();
                    for (const id of [1, 2, 3]) {
                        tx.insert(rawMessages)
                            .values({ chatId: 1, id, userid: 'spike-user', text: `message ${id}`, receivedAt: now })
                            .onConflictDoNothing()
                            .run();
                    }
                });
                return 'wrote chat 1 and 3 messages in one transaction';
            } finally {
                await close();
            }
        });
    }

    function read() {
        return run('Read', async () => {
            const { db, close } = await openAccountDatabase(SPIKE_ACCOUNT_ID);
            try {
                const maxId = db
                    .select({ id: rawMessages.id })
                    .from(rawMessages)
                    .all()
                    .reduce((max, row) => Math.max(max, row.id), 0);
                return `chats=${countOf(db, chats)} messages=${countOf(db, rawMessages)} maxMessageId=${maxId}`;
            } finally {
                await close();
            }
        });
    }

    function cascadeTest() {
        return run('Cascade test', async () => {
            const { db, close } = await openAccountDatabase(SPIKE_ACCOUNT_ID);
            try {
                db.delete(chats).where(eq(chats.id, 1)).run();
                return `remaining messages=${countOf(db, rawMessages)}`;
            } finally {
                await close();
            }
        });
    }

    function deleteDb() {
        return run('Delete DB', async () => {
            await deleteAccountDatabase(SPIKE_ACCOUNT_ID);
            return 'deleted';
        });
    }

    function capabilities() {
        return run('Capabilities', async () => {
            const caps = readCapabilities();
            caps.persist = await readPersist();
            return JSON.stringify(caps);
        });
    }

    function repoWrite() {
        return run('Repo write', async () => {
            const storage = await accountStorage.open(SPIKE_REPO_ACCOUNT_ID);
            try {
                const now = Date.now();
                await storage.chats.applySnapshot([
                    {
                        id: 1, name: 'Repo chat 1', visibility: 'private', directchat: false,
                        role: 'member', joined: true, ownerUserid: 'spike-owner',
                        members: [{ userid: 'spike-owner', role: 'owner' }, { userid: 'spike-user', role: 'member' }],
                    },
                    {
                        id: 2, name: 'Repo chat 2', visibility: 'private', directchat: false,
                        role: 'member', joined: true, ownerUserid: 'spike-owner',
                        members: [{ userid: 'spike-owner', role: 'owner' }],
                    },
                ], now);
                const result = await storage.messages.appendBatch(1, [1, 2, 3].map(id => ({
                    id, userid: 'spike-user', userNick: 'Spike', userFullname: null, userHash: null,
                    serverTime: null, important: false, text: `repo message ${id}`,
                    photoId: null, fileId: null, position: null,
                })), now);
                return `wrote 2 chats, members, ${result.inserted} messages, cursor ${result.polledUpTo}`;
            } finally {
                await storage.close();
            }
        });
    }

    function repoRead() {
        return run('Repo read', async () => {
            const storage = await accountStorage.open(SPIKE_REPO_ACCOUNT_ID);
            try {
                const chatList = await storage.chats.list();
                const members = await storage.chats.listMembers(1);
                const page = await storage.messages.listPage(1, { limit: 10 });
                const chat = await storage.chats.get(1);
                return `chats=${chatList.length} members(1)=${members.length} messages(1)=${page.length} cursor=${chat?.polledUpTo ?? 'none'}`;
            } finally {
                await storage.close();
            }
        });
    }

    function repoPurge() {
        return run('Repo purge chat 1', async () => {
            const storage = await accountStorage.open(SPIKE_REPO_ACCOUNT_ID);
            try {
                await storage.chats.purge(1);
                const remaining = await storage.chats.list();
                const page = await storage.messages.listPage(1, { limit: 10 });
                return `remaining chats=${remaining.length} messages(1)=${page.length}`;
            } finally {
                await storage.close();
            }
        });
    }

    function repoDelete() {
        return run('Repo delete account storage', async () => {
            await accountStorage.destroy(SPIKE_REPO_ACCOUNT_ID);
            const status = getStorageStatus();
            return `deleted (mode: ${status.mode}${status.mode === 'memory' ? `, reason: ${status.reason}` : ''})`;
        });
    }

    return (
        <ScrollView backgroundColor="background" contentContainerStyle={{ padding: Spacing.four }}>
            <YStack gap={Spacing.two}>
                <H2>SQLite spike</H2>
                <XStack gap={Spacing.two} flexWrap="wrap">
                    <Button disabled={busy} onPress={() => void openAndMigrate()}>Open + migrate</Button>
                    <Button disabled={busy} onPress={() => void write()}>Write</Button>
                    <Button disabled={busy} onPress={() => void read()}>Read</Button>
                    <Button disabled={busy} onPress={() => void cascadeTest()}>Cascade test</Button>
                    <Button disabled={busy} onPress={() => void deleteDb()}>Delete DB</Button>
                    <Button disabled={busy} onPress={() => void capabilities()}>Capabilities</Button>
                </XStack>
                <H2>Repo round trip</H2>
                <Text fontFamily="mono" color="textSecondary">
                    {`storage status: ${JSON.stringify(getStorageStatus())}`}
                </Text>
                <XStack gap={Spacing.two} flexWrap="wrap">
                    <Button disabled={busy} onPress={() => void repoWrite()}>Write via repos</Button>
                    <Button disabled={busy} onPress={() => void repoRead()}>Read via repos</Button>
                    <Button disabled={busy} onPress={() => void repoPurge()}>Purge chat 1</Button>
                    <Button disabled={busy} onPress={() => void repoDelete()}>Delete account storage</Button>
                </XStack>
                <Text fontFamily="mono" color="textSecondary">
                    {output.length === 0 ? 'No output yet.' : output.join('\n')}
                </Text>
            </YStack>
        </ScrollView>
    );
}
