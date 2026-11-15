import { drizzle } from "drizzle-orm/node-postgres";

import * as authSchema from "./auth-schema.ts";
import * as chatSettingsSchema from "./chat-settings.ts";

export const schema = { ...authSchema, ...chatSettingsSchema };

export const db = drizzle(process.env.DATABASE_URL as string, { schema });
