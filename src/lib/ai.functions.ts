import { createGoogle } from "@ai-sdk/google";
import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";

import { ChatError } from "#/lib/errors";

interface GenerateReplyInput {
	messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
	model?: string;
}

interface GenerateTitleInput {
	message: string;
	model?: string;
}

export const generateTitle = createServerFn({ method: "POST" })
	.validator((data: GenerateTitleInput) => data)
	.handler(async ({ data }) => {
		const apiKey = process.env.GEMINI_API_KEY;
		const fallback = data.message
			.trim()
			.split(/\s+/)
			.slice(0, 5)
			.join(" ")
			.slice(0, 40);

		if (!apiKey) return { title: fallback };

		const model = data.model || "gemini-3.5-flash-lite";
		const prompt = `
			Generate a short, elegant, and context-aware title for the conversation based on the user's first message.
			**Guidelines:**
			- Keep the title between 3 and 5 words.
			- Capture the primary topic or intent of the conversation.
			- Use clear, natural, and professional language.
			- Prefer concise, meaningful phrases over generic descriptions.
			- Use Title Case.
			- Avoid unnecessary words, filler, emojis, and special characters.
			- Do not include phrases like "Discussion About" or "Help With".
			- If the message is technical, use relevant technical terminology.
			- If the message is ambiguous, infer the most likely topic without inventing context.

			**Output:** Return only the title text. No quotes, explanations, or punctuation.
			Message: ${data.message}
		`;

		try {
			const google = createGoogle({ apiKey });
			const { text } = await generateText({
				model: google(model),
				prompt,
			});
			const title = text
				.trim()
				.replace(/^["'`]+|["'`]+$/g, "")
				.replace(/\s+/g, " ")
				.slice(0, 60);
			return { title: title || fallback };
		} catch {
			return { title: fallback };
		}
	});

export const generateReply = createServerFn({ method: "POST" })
	.validator((data: GenerateReplyInput) => data)
	.handler(async ({ data }) => {
		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) {
			throw new ChatError("internal:api", {
				cause: "GEMINI_API_KEY is not set on the server.",
			});
		}

		const model = data.model || "gemini-3.5-flash-lite";
		const google = createGoogle({ apiKey });

		const { text } = await generateText({
			model: google(model),
			messages: data.messages.map((m) => ({
				role: m.role,
				content: m.content,
			})),
		});

		return { text, model };
	});
