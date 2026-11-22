import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    dialect: 'sqlite',
    driver: 'expo',
    schema: './src/storage/db/schema.ts',
    out: './src/storage/db/migrations',
});
