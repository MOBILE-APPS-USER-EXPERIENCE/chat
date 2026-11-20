import { eq, sql } from 'drizzle-orm';
import { useState } from 'react';
import { Button, H2, ScrollView, Text, XStack, YStack } from 'tamagui';

import { Spacing } from '@/constants/layout';
import { deleteAccountDatabase, openAccountDatabase } from '@/storage/db/openDatabase';
import { chats, rawMessages } from '@/storage/db/schema';

/**
 * Temporary dev-only spike for the SQLite + Drizzle decision (ADR-005). Not linked from the app.
 * It is the manual test surface for the checklist in the ADR.
 */

const SPIKE_ACCOUNT_ID = 'spike';

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
                <Text fontFamily="mono" color="textSecondary">
                    {output.length === 0 ? 'No output yet.' : output.join('\n')}
                </Text>
            </YStack>
        </ScrollView>
    );
}
