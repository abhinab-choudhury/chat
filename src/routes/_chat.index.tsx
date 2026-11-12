import { createFileRoute } from "@tanstack/react-router";

import { ChatHome } from "#/components/chat/chat-home";

export const Route = createFileRoute("/_chat/")({
	component: ChatHome,
});
