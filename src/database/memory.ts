import {
	bigint,
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	vector,
} from "drizzle-orm/pg-core";
import { chatMessages, chatThreads } from "./chats";

export const agentRuns = pgTable("agent_runs", {
	id: text("id").primaryKey(),
	threadId: text("thread_id")
		.notNull()
		.references(() => chatThreads.id, { onDelete: "cascade" }),
	questionId: text("question_id")
		.notNull()
		.references(() => chatMessages.id, { onDelete: "cascade" }),
	state: text("state").notNull(),
	startedAt: bigint("started_at", { mode: "number" }).notNull(),
	answerId: text("answer_id").references(() => chatMessages.id, {
		onDelete: "set null",
	}),
	options: jsonb("options").notNull(),
	error: text("error"),
});
export const memoryEpisodes = pgTable(
	"memory_episodes",
	{
		id: text("id").primaryKey(),
		userId: text("user_id").notNull(),
		threadId: text("thread_id")
			.notNull()
			.references(() => chatThreads.id, { onDelete: "cascade" }),
		questionId: text("question_id")
			.notNull()
			.references(() => chatMessages.id, { onDelete: "cascade" }),
		answerId: text("answer_id")
			.notNull()
			.references(() => chatMessages.id, { onDelete: "cascade" }),
		questionAt: bigint("question_at", { mode: "number" }).notNull(),
		question: text("question").notNull(),
		answer: text("answer").notNull(),
		evidence: jsonb("evidence").notNull(),
		embedding: vector("embedding", { dimensions: 1024 }),
		embeddingModel: text("embedding_model"),
		archived: boolean("archived").notNull().default(false),
		forgotten: boolean("forgotten").notNull().default(false),
	},
	(t) => [index("memory_episodes_owner_date_idx").on(t.userId, t.questionAt)],
);
export const memoryFacts = pgTable("memory_facts", {
	id: text("id").primaryKey(),
	episodeId: text("episode_id")
		.notNull()
		.references(() => memoryEpisodes.id, { onDelete: "cascade" }),
	userId: text("user_id").notNull(),
	key: text("key").notNull(),
	content: text("content").notNull(),
	quote: text("quote").notNull(),
	createdAt: bigint("created_at", { mode: "number" }).notNull(),
	supersededBy: text("superseded_by"),
});
export const memoryJobs = pgTable("memory_jobs", {
	id: text("id").primaryKey(),
	episodeId: text("episode_id")
		.notNull()
		.references(() => memoryEpisodes.id, { onDelete: "cascade" }),
	state: text("state").notNull().default("pending"),
	attempts: integer("attempts").notNull().default(0),
	nextAttemptAt: bigint("next_attempt_at", { mode: "number" }).notNull(),
});
