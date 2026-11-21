CREATE TABLE `outbox` (
	`client_message_id` text PRIMARY KEY NOT NULL,
	`chat_id` integer NOT NULL,
	`text` text,
	`photo_uri` text,
	`file_uri` text,
	`position` text,
	`important` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_retry_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "outbox_status_check" CHECK(status in ('pending', 'sending', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `outbox_status_next_retry_idx` ON `outbox` (`status`,`next_retry_at`);