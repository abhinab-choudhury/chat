import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import * as React from "react";
import { useSession } from "#/hooks/auth-hooks";
import { generateTitle } from "#/lib/ai.functions";

import { getCurrentUserId } from "#/lib/user-id";
import { useChatStore } from "#/store/chat-store";
import { useModelStore } from "#/store/model-store";
import { api } from "../../../convex/_generated/api";
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
	const { user, isPending } = useSession();
	const navigate = useNavigate();
	const createThread = useMutation(api.threads.createThread);
	const sendMessage = useMutation(api.messages.sendMessage);
	const renameThread = useMutation(api.threads.renameThread);
	const message = useChatStore((s) => s.input);
	const setMessage = useChatStore((s) => s.setInput);
	const busy = useChatStore((s) => s.busy);
	const setBusy = useChatStore((s) => s.setBusy);
	const setPendingAutoSend = useChatStore((s) => s.setPendingAutoSend);
	const setPendingInitialMessage = useChatStore(
		(s) => s.setPendingInitialMessage,
	);
	const model = useModelStore((s) => s.selectedModel);
	const setModel = useModelStore((s) => s.setSelectedModel);
	const submittingRef = React.useRef(false);

	const isAuthenticated = Boolean(user);
	const userId = isPending ? null : (user?.id ?? getCurrentUserId(null));

	const categories = isAuthenticated
		? DEFAULT_QUESTION_CATEGORIES.map((category) =>
				category.id === "create"
					? { ...category, questions: AUTH_QUESTIONS }
					: category,
			)
		: DEFAULT_QUESTION_CATEGORIES;

	const handleSubmit = React.useCallback(async () => {
		const trimmed = message.trim();
		if (!trimmed || !userId || submittingRef.current) return;
		submittingRef.current = true;
		setBusy(true);
		setMessage("");

		const fallbackTitle = trimmed
			.split(/\s+/)
			.slice(0, 5)
			.join(" ")
			.slice(0, 40);
		const clientUuid = crypto.randomUUID();

		// Generate title in background so thread creation/navigation aren't blocked.
		const titlePromise = generateTitle({ data: { message: trimmed } })
			.then((generated) => generated?.title || fallbackTitle)
			.catch(() => fallbackTitle);

		try {
			const threadId = await createThread({
				userId,
				title: fallbackTitle,
				clientUuid,
			});

			void titlePromise.then((title) => {
				if (title && title !== fallbackTitle) {
					void renameThread({ threadId, title });
				}
			});

			const sendPromise = sendMessage({
				clientUuid: crypto.randomUUID(),
				threadId,
				role: "user",
				content: trimmed,
				userId,
			}).catch((err) => {
				console.error("Failed to persist initial message", err);
			});

			setPendingInitialMessage(trimmed);
			setPendingAutoSend(true);
			void navigate({ to: "/thread/$threadId", params: { threadId } });
			await sendPromise;
		} catch (e) {
			console.error(e);
			setMessage(trimmed);
		} finally {
			submittingRef.current = false;
			setBusy(false);
		}
	}, [
		message,
		createThread,
		sendMessage,
		renameThread,
		navigate,
		userId,
		setMessage,
		setBusy,
		setPendingAutoSend,
		setPendingInitialMessage,
	]);

	const handleSelect = React.useCallback(
		(question: { id: string; label: string }) => {
			setMessage(question.label);
		},
		[setMessage],
	);

	return (
		<div className="flex flex-1 flex-col items-center px-4 pb-6 pt-20">
			<div className="flex w-full max-w-2xl flex-1 flex-col gap-4">
				{!message.trim() && (
					<>
						<div className="text-left">
							<div className="flex items-center gap-3">
								<div>
									<h1 className="text-xl font-bold tracking-tight sm:text-2xl">
										{isAuthenticated
											? `How can I help, ${user?.name}?`
											: "Welcome to Chat"}
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
					</>
				)}
			</div>

			<div className="sticky bottom-0 z-20 mt-auto w-full px-4">
				<div className="mx-auto w-full max-w-2xl">
					<ChatInput
						value={message}
						onChange={setMessage}
						onSubmit={handleSubmit}
						disabled={!userId || busy}
						model={model}
						onModelChange={setModel}
						placeholder={
							isAuthenticated ? "Type your message..." : "Ask a question..."
						}
					/>
				</div>
			</div>
		</div>
	);
}
