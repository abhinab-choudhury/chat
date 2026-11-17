import { createServerFn } from "@tanstack/react-start";

interface GenerateTitleInput {
	message: string;
	model?: string;
}

export const generateTitle = createServerFn({ method: "POST" })
	.validator((data: GenerateTitleInput) => data)
	.handler(async ({ data }) => ({
		title:
			data.message.trim().split(/\s+/).slice(0, 7).join(" ").slice(0, 60) ||
			"New chat",
	}));
