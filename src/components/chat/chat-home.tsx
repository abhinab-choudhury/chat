import * as React from "react";

import { authClient } from "#/lib/auth-client";
import { ChatInput } from "./chat-input";
import {
	DEFAULT_QUESTION_CATEGORIES,
	SuggestedQuestions,
} from "./suggested-questions";

const AUTH_QUESTIONS = [
	{ id: "a1", label: "Summarize my recent conversations" },
	{ id: "a2", label: "Draft a reply to a customer" },
	{ id: "a3", label: "Brainstorm ideas for a new feature" },
	{ id: "a4", label: "Explain a code snippet" },
];

export function ChatHome() {
	const { data: session } = authClient.useSession();
	const [message, setMessage] = React.useState("");

	const isAuthenticated = Boolean(session?.user);

	const categories = isAuthenticated
		? DEFAULT_QUESTION_CATEGORIES.map((category) =>
				category.id === "create"
					? { ...category, questions: AUTH_QUESTIONS }
					: category,
			)
		: DEFAULT_QUESTION_CATEGORIES;

	const handleSubmit = React.useCallback(() => {
		const trimmed = message.trim();
		if (!trimmed) return;
		// Placeholder: wire to chat backend later.
		setMessage("");
	}, [message]);

	const handleSelect = React.useCallback(
		(question: { id: string; label: string }) => {
			setMessage(question.label);
		},
		[],
	);

	return (
		<div className="flex flex-1 flex-col items-center px-4 pb-6 pt-20">
			<div className="flex w-full max-w-2xl flex-1 flex-col gap-4">
				<div className="text-left">
					<div className="flex items-center gap-3">
						<div>
							<h1 className="text-xl font-bold tracking-tight sm:text-2xl">
								{isAuthenticated ? "How can I help?" : "Welcome to Chat"}
							</h1>
							<p className="mt-0.5 text-sm text-muted-foreground">
								{isAuthenticated
									? "Ask anything or pick a suggestion to get started."
									: "Sign in to save conversations, or try a question below."}
							</p>
						</div>
					</div>
				</div>

				<div className="text-left">
					<p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Suggestions
					</p>
					<SuggestedQuestions
						categories={categories}
						defaultCategoryId="create"
						onSelect={handleSelect}
					/>
				</div>
			</div>

			<div className="sticky bottom-0 z-20 mt-auto w-full px-4">
				<div className="mx-auto w-full max-w-2xl">
					<ChatInput
						value={message}
						onChange={setMessage}
						onSubmit={handleSubmit}
						placeholder={
							isAuthenticated ? "Type your message..." : "Ask a question..."
						}
					/>
				</div>
			</div>
		</div>
	);
}
