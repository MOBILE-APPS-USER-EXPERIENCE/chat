import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/**
 * Drizzle mirror of the account database in `docs/db-model.dbml` (STORE 2).
 *
 * Conventions:
 * - timestamps are epoch milliseconds in `integer` columns
 * - booleans are `integer` columns with `mode: 'boolean'`
 * - enums are `text` columns with a `CHECK` constraint and a TypeScript union type
 * - userids are stored lowercase; the mapper lowercases them before they reach a repository
 */

export const CHAT_VISIBILITIES = ["public", "private"] as const;
export const CHAT_ROLES = [
  "owner",
  "member",
  "invited",
  "admin",
  "none",
] as const;
export const MEMBER_ROLES = ["owner", "member", "invited"] as const;
export const OUTBOX_STATUSES = ["pending", "sending", "failed"] as const;

export type ChatVisibility = (typeof CHAT_VISIBILITIES)[number];
export type ChatRole = (typeof CHAT_ROLES)[number];
export type MemberRole = (typeof MEMBER_ROLES)[number];
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

function inList(column: string, values: readonly string[]): string {
  return `${column} in (${values.map((value) => `'${value}'`).join(", ")})`;
}

export const chats = sqliteTable(
  "chats",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    visibility: text("visibility", { enum: CHAT_VISIBILITIES }).notNull(),
    directchat: integer("directchat", { mode: "boolean" })
      .notNull()
      .default(false),
    role: text("role", { enum: CHAT_ROLES }).notNull(),
    joined: integer("joined", { mode: "boolean" }).notNull(),
    ownerUserid: text("owner_userid"),
    firstSeenAt: integer("first_seen_at").notNull(),
    missingSince: integer("missing_since"),
    syncedAt: integer("synced_at").notNull(),
    polledUpTo: integer("polled_up_to").notNull().default(0),
    lastPolledAt: integer("last_polled_at"),
  },
  () => [
    check(
      "chats_visibility_check",
      sql.raw(inList("visibility", CHAT_VISIBILITIES)),
    ),
    check("chats_role_check", sql.raw(inList("role", CHAT_ROLES))),
  ],
);

export const chatMembers = sqliteTable(
  "chat_members",
  {
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    userid: text("userid").notNull(),
    role: text("role", { enum: MEMBER_ROLES }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.chatId, table.userid] }),
    check("chat_members_role_check", sql.raw(inList("role", MEMBER_ROLES))),
  ],
);

export const profiles = sqliteTable("profiles", {
  userid: text("userid").primaryKey(),
  hash: text("hash").notNull().unique(),
  nickname: text("nickname"),
  fullname: text("fullname"),
  fetchedAt: integer("fetched_at").notNull(),
  missingSince: integer("missing_since"),
});

export const rawMessages = sqliteTable(
  "raw_messages",
  {
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    id: integer("id").notNull(),
    userid: text("userid").notNull(),
    userNick: text("user_nick"),
    userFullname: text("user_fullname"),
    userHash: text("user_hash"),
    serverTime: text("server_time"),
    important: integer("important", { mode: "boolean" })
      .notNull()
      .default(false),
    text: text("text"),
    photoId: text("photo_id"),
    fileId: text("file_id"),
    position: text("position"),
    receivedAt: integer("received_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.chatId, table.id] })],
);

export const outbox = sqliteTable(
  "outbox",
  {
    clientMessageId: text("client_message_id").primaryKey(),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    text: text("text"),
    photoUri: text("photo_uri"),
    fileUri: text("file_uri"),
    position: text("position"),
    important: integer("important", { mode: "boolean" })
      .notNull()
      .default(false),
    status: text("status", { enum: OUTBOX_STATUSES })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextRetryAt: integer("next_retry_at"),
    lastError: text("last_error"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    check("outbox_status_check", sql.raw(inList("status", OUTBOX_STATUSES))),
    // Mirrors the `(status, next_retry_at)` index from docs/db-model.dbml; used by listDue().
    index("outbox_status_next_retry_idx").on(table.status, table.nextRetryAt),
  ],
);
