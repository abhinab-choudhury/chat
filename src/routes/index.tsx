import { createFileRoute, redirect } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Bubble, BubbleContent } from "#/components/ui/bubble";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Marker, MarkerContent } from "#/components/ui/marker";
import {
	Message,
	MessageAvatar,
	MessageContent,
	MessageFooter,
	MessageHeader,
} from "#/components/ui/message";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "#/components/ui/message-scroller";
import { Toaster } from "#/components/ui/sonner";
import { ensureSession } from "#/lib/auth.functions";
import { authClient } from "#/lib/auth-client";

type ChatMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
	createdAt: number;
};

const INITIAL_MESSAGES: ChatMessage[] = [
	{
		id: "welcome",
		role: "assistant",
		content: "Hi! I'm your assistant. Send a message to start chatting.",
		createdAt: Date.now(),
	},
];

export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		try {
			await ensureSession();
		} catch {
			throw redirect({ to: "/login" });
		}
	},
	component: HomePage,
});

function HomePage() {
	const { data: session } = authClient.useSession();
	const [messages, setMessages] =
		React.useState<ChatMessage[]>(INITIAL_MESSAGES);
	const [input, setInput] = React.useState("");
	const [sending, setSending] = React.useState(false);

	const userInitials = React.useMemo(() => {
		const name = session?.user?.name ?? "You";
		return name
			.split(" ")
			.map((part) => part.charAt(0))
			.join("")
			.slice(0, 2)
			.toUpperCase();
	}, [session?.user?.name]);

	const handleSend = async (e: React.FormEvent) => {
		e.preventDefault();
		const text = input.trim();
		if (!text || sending) return;

		const userMessage: ChatMessage = {
			id: crypto.randomUUID(),
			role: "user",
			content: text,
			createdAt: Date.now(),
		};

		setMessages((prev) => [...prev, userMessage]);
		setInput("");
		setSending(true);
		toast.success("Message sent");

		// Simulate an assistant reply.
		window.setTimeout(() => {
			const reply: ChatMessage = {
				id: crypto.randomUUID(),
				role: "assistant",
				content: `You said: "${text}". (This is a demo reply.)`,
				createdAt: Date.now(),
			};
			setMessages((prev) => [...prev, reply]);
			setSending(false);
			toast.info("New reply received");
		}, 800);
	};

	const handleSignOut = async () => {
		await authClient.signOut();
		toast.success("Signed out");
	};

	return (
		<div className="flex h-screen flex-col">
			<header className="flex items-center justify-between border-b px-4 py-3">
				<div className="flex items-center gap-2">
					<span className="text-lg font-semibold">Chat</span>
				</div>
				<div className="flex items-center gap-3">
					<span className="text-sm text-muted-foreground">
						{session?.user?.name ?? "Signed in"}
					</span>
					<Button
						variant="outline"
						size="sm"
						onClick={() => void handleSignOut()}
					>
						Sign out
					</Button>
				</div>
			</header>

			<div className="flex min-h-0 flex-1">
				<MessageScrollerProvider autoScroll>
					<MessageScroller className="flex-1">
						<MessageScrollerViewport>
							<MessageScrollerContent>
								<Marker variant="separator">
									<MarkerContent>Today</MarkerContent>
								</Marker>
								{messages.map((message) => (
									<MessageScrollerItem
										key={message.id}
										messageId={message.id}
										scrollAnchor={message.role === "user"}
									>
										<Message align={message.role === "user" ? "end" : "start"}>
											<MessageAvatar>
												<Avatar>
													{message.role === "assistant" ? (
														<AvatarFallback>AI</AvatarFallback>
													) : (
														<>
															{session?.user?.image ? (
																<AvatarImage
																	src={session.user.image}
																	alt={session.user.name ?? "You"}
																/>
															) : null}
															<AvatarFallback>{userInitials}</AvatarFallback>
														</>
													)}
												</Avatar>
											</MessageAvatar>
											<MessageContent>
												{message.role === "assistant" ? (
													<MessageHeader>Assistant</MessageHeader>
												) : (
													<MessageHeader>
														{session?.user?.name ?? "You"}
													</MessageHeader>
												)}
												<Bubble
													variant={
														message.role === "user" ? "default" : "secondary"
													}
													align={message.role === "user" ? "end" : "start"}
												>
													<BubbleContent>{message.content}</BubbleContent>
												</Bubble>
												<MessageFooter>
													{new Date(message.createdAt).toLocaleTimeString()}
												</MessageFooter>
											</MessageContent>
										</Message>
									</MessageScrollerItem>
								))}
								{sending ? (
									<MessageScrollerItem messageId="typing" scrollAnchor={false}>
										<Message align="start">
											<MessageAvatar>
												<Avatar>
													<AvatarFallback>AI</AvatarFallback>
												</Avatar>
											</MessageAvatar>
											<MessageContent>
												<MessageHeader>Assistant</MessageHeader>
												<Bubble variant="secondary" align="start">
													<BubbleContent className="animate-pulse">
														Thinking…
													</BubbleContent>
												</Bubble>
											</MessageContent>
										</Message>
									</MessageScrollerItem>
								) : null}
							</MessageScrollerContent>
						</MessageScrollerViewport>
						<MessageScrollerButton />
					</MessageScroller>
				</MessageScrollerProvider>
			</div>

			<form onSubmit={(e) => void handleSend(e)} className="border-t p-4">
				<div className="flex items-center gap-2">
					<Input
						value={input}
						onChange={(e) => setInput(e.target.value)}
						placeholder="Type a message…"
						disabled={sending}
						className="flex-1"
					/>
					<Button type="submit" disabled={sending || !input.trim()}>
						Send
					</Button>
				</div>
			</form>

			<Toaster />
		</div>
	);
}
