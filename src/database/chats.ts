import {
	bigint,
	boolean,
	index,
	jsonb,
	pgTable,
	text,
} from "drizzle-orm/pg-core";

export const chatThreads = pgTable(
	"chat_threads",
	{
		id: text("id").primaryKey(),
		userId: text("user_id").notNull(),
		title: text("title").notNull(),
		createdAt: bigint("created_at", { mode: "number" }).notNull(),
		updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
		isPublic: boolean("is_public").notNull().default(false),
		archived: boolean("archived").notNull().default(false),
		currentStreamId: text("current_stream_id"),
		streamStartedAt: bigint("stream_started_at", { mode: "number" }),
	},
	(table) => [
		index("chat_threads_user_updated_idx").on(table.userId, table.updatedAt),
	],
);

export const chatMessages = pgTable(
	"chat_messages",
	{
		id: text("id").primaryKey(),
		threadId: text("thread_id")
			.notNull()
			.references(() => chatThreads.id, { onDelete: "cascade" }),
		clientUuid: text("client_uuid").notNull().unique(),
		role: text("role").notNull(),
		content: text("content").notNull(),
		reasoning: text("reasoning"),
		toolData: jsonb("tool_data"),
		createdAt: bigint("created_at", { mode: "number" }).notNull(),
	},
	(table) => [
		index("chat_messages_thread_created_idx").on(
			table.threadId,
			table.createdAt,
		),
	],
);
