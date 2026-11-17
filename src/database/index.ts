import { drizzle } from "drizzle-orm/node-postgres";

import * as chatSettingsSchema from "./schema.ts";

export const schema = { ...chatSettingsSchema };

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
	throw new Error("DATABASE_URL is required for chat persistence.");
export const db = drizzle(databaseUrl, { schema });
