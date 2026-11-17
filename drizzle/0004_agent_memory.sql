CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"question_id" text NOT NULL,
	"state" text NOT NULL,
	"started_at" bigint NOT NULL,
	"answer_id" text,
	"options" jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "memory_episodes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"question_id" text NOT NULL,
	"answer_id" text NOT NULL,
	"question_at" bigint NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"embedding" vector(1024),
	"embedding_model" text,
	"archived" boolean DEFAULT false NOT NULL,
	"forgotten" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"content" text NOT NULL,
	"quote" text NOT NULL,
	"created_at" bigint NOT NULL,
	"superseded_by" text
);
--> statement-breakpoint
CREATE TABLE "memory_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_question_id_chat_messages_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_answer_id_chat_messages_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_episodes" ADD CONSTRAINT "memory_episodes_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_episodes" ADD CONSTRAINT "memory_episodes_question_id_chat_messages_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_episodes" ADD CONSTRAINT "memory_episodes_answer_id_chat_messages_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_episode_id_memory_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."memory_episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_jobs" ADD CONSTRAINT "memory_jobs_episode_id_memory_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."memory_episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_episodes_owner_date_idx" ON "memory_episodes" USING btree ("user_id","question_at");
--> statement-breakpoint
CREATE INDEX memory_episodes_lexical_idx ON memory_episodes USING gin (to_tsvector('english', question || ' ' || answer));
--> statement-breakpoint
CREATE INDEX memory_episodes_vector_idx ON memory_episodes USING hnsw (embedding vector_cosine_ops);
--> statement-breakpoint
CREATE INDEX memory_jobs_due_idx ON memory_jobs (state, next_attempt_at);
