import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Legacy provider settings table, retained for existing database migrations.
 * Runtime credentials now come exclusively from the server environment.
 */
export const userSettings = pgTable("user_settings", {
	userId: text("user_id").primaryKey(),
	geminiKey: text("gemini_key"),
	defaultSearchProvider: text("default_search_provider"),
	// Encrypted keys keyed by search provider id.
	searchKeys: jsonb("search_keys")
		.$type<Record<string, string>>()
		.default({})
		.notNull(),
	// Optional provider-specific options (country, language, safesearch, ...).
	searchOptions: jsonb("search_options")
		.$type<Record<string, Record<string, string>>>()
		.default({})
		.notNull(),
	onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export type UserSettingsRow = typeof userSettings.$inferSelect;
