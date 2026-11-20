CREATE TABLE `chat_members` (
	`chat_id` integer NOT NULL,
	`userid` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`chat_id`, `userid`),
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chat_members_role_check" CHECK(role in ('owner', 'member', 'invited'))
);
--> statement-breakpoint
CREATE TABLE `chats` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`visibility` text NOT NULL,
	`directchat` integer DEFAULT false NOT NULL,
	`role` text NOT NULL,
	`joined` integer NOT NULL,
	`owner_userid` text,
	`first_seen_at` integer NOT NULL,
	`missing_since` integer,
	`synced_at` integer NOT NULL,
	`polled_up_to` integer DEFAULT 0 NOT NULL,
	`last_polled_at` integer,
	CONSTRAINT "chats_visibility_check" CHECK(visibility in ('public', 'private')),
	CONSTRAINT "chats_role_check" CHECK(role in ('owner', 'member', 'invited', 'admin', 'none'))
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`userid` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`nickname` text,
	`fullname` text,
	`fetched_at` integer NOT NULL,
	`missing_since` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_hash_unique` ON `profiles` (`hash`);--> statement-breakpoint
CREATE TABLE `raw_messages` (
	`chat_id` integer NOT NULL,
	`id` integer NOT NULL,
	`userid` text NOT NULL,
	`user_nick` text,
	`user_fullname` text,
	`user_hash` text,
	`server_time` text,
	`important` integer DEFAULT false NOT NULL,
	`text` text,
	`photo_id` text,
	`file_id` text,
	`position` text,
	`received_at` integer NOT NULL,
	PRIMARY KEY(`chat_id`, `id`),
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
