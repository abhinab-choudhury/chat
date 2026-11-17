CREATE TABLE "chat_threads" (
 "id" text PRIMARY KEY NOT NULL,
 "user_id" text NOT NULL,
 "title" text NOT NULL,
 "created_at" bigint NOT NULL,
 "updated_at" bigint NOT NULL,
 "is_public" boolean DEFAULT false NOT NULL,
 "archived" boolean DEFAULT false NOT NULL,
 "current_stream_id" text,
 "stream_started_at" bigint
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
 "id" text PRIMARY KEY NOT NULL,
 "thread_id" text NOT NULL REFERENCES "chat_threads"("id") ON DELETE CASCADE,
 "client_uuid" text UNIQUE NOT NULL,
 "role" text NOT NULL CHECK ("role" IN ('user', 'assistant')),
 "content" text NOT NULL,
 "reasoning" text,
 "tool_data" jsonb,
 "created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chat_threads_user_updated_idx" ON "chat_threads" ("user_id", "updated_at");
--> statement-breakpoint
CREATE INDEX "chat_messages_thread_created_idx" ON "chat_messages" ("thread_id", "created_at");
