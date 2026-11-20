/** @jest-environment node */

import { existsSync, readdirSync } from 'fs';
import path from 'path';

import migrations from '../db/migrations/migrations';

const MIGRATIONS_FOLDER = path.join(__dirname, '..', 'db', 'migrations');

/**
 * Drift guard: the journal, the `.sql` files and the `migrations.js` bundle must stay in sync.
 * The bundle is imported under Jest (jest-expo + babel-plugin-inline-import inlines the `.sql`
 * files as strings), so this also proves the bundle loads in the test environment.
 */
describe('migration artifacts', () => {
    it('has a .sql file for every journal entry', () => {
        for (const entry of migrations.journal.entries) {
            const file = path.join(MIGRATIONS_FOLDER, `${entry.tag}.sql`);
            expect(existsSync(file)).toBe(true);
        }
    });

    it('exports a migrations key for every journal entry', () => {
        const bundle = migrations.migrations as Record<string, unknown>;
        for (const entry of migrations.journal.entries) {
            const key = `m${entry.idx.toString().padStart(4, '0')}`;
            expect(bundle).toHaveProperty(key);
            expect(typeof bundle[key]).toBe('string');
        }
    });

    it('has no .sql files the journal does not know about', () => {
        const known = new Set(migrations.journal.entries.map(entry => `${entry.tag}.sql`));
        const sqlFiles = readdirSync(MIGRATIONS_FOLDER).filter(name => name.endsWith('.sql'));
        expect(sqlFiles.sort()).toEqual([...known].sort());
    });
});
