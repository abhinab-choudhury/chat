CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"gemini_key" text,
	"default_search_provider" text,
	"search_keys" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"memory_key" text,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;