import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
	CornerDownLeftIcon,
	MessageSquareIcon,
	PlusIcon,
	SearchIcon,
} from "lucide-react";
import * as React from "react";
import {
	Command,
	CommandDialog,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "#/components/ui/command";
import { Kbd, KbdGroup } from "#/components/ui/kbd";
import { useSession } from "#/hooks/auth-hooks";
import { getCurrentUserId } from "#/lib/user-id";
import { useSearchStore } from "#/store/search-store";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";

const DEBOUNCE_MS = 180;
const RESULT_LIMIT = 20;

function formatRelativeTime(timestamp: number) {
	const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
	if (seconds < 5) return "just now";
	if (seconds < 60) return `${seconds}s ago`;

	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;

	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;

	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;

	const months = Math.floor(days / 30);
	if (months < 12) return `${months}mo ago`;

	return `${Math.floor(days / 365)}y ago`;
}

/**
 * Thread search palette, opened with ⌘/Ctrl+K or the "Search chats" button
 * in the sidebar. Searches the user's thread titles via the Convex search
 * index and falls back to recently updated threads for an empty query.
 */
export function SearchThreadsDialog() {
	const navigate = useNavigate();
	const open = useSearchStore((state) => state.open);
	const setOpen = useSearchStore((state) => state.setOpen);
	const { user, isPending } = useSession();
	const userId = isPending ? null : (user?.id ?? getCurrentUserId(null));

	const [query, setQuery] = React.useState("");
	const [debouncedQuery, setDebouncedQuery] = React.useState("");
	const [results, setResults] = React.useState<Doc<"threads">[]>([]);

	React.useEffect(() => {
		const timer = window.setTimeout(
			() => setDebouncedQuery(query),
			DEBOUNCE_MS,
		);
		return () => window.clearTimeout(timer);
	}, [query]);

	const data = useQuery(
		api.threads.searchThreads,
		userId && open
			? { userId, query: debouncedQuery, limit: RESULT_LIMIT }
			: "skip",
	);

	React.useEffect(() => {
		if (data) setResults(data);
	}, [data]);

	React.useEffect(() => {
		if (!open) {
			setQuery("");
			setDebouncedQuery("");
			setResults([]);
		}
	}, [open]);

	const searching = debouncedQuery.trim().length > 0;
	const hasQuery = query.trim().length > 0;
	const loading = userId !== null && data === undefined;

	const handleSelectThread = (threadId: string) => {
		setOpen(false);
		void navigate({
			to: "/thread/$threadId",
			params: { threadId },
		});
	};

	const handleNewChat = () => {
		setOpen(false);
		void navigate({ to: "/" });
	};

	if (!userId) return null;

	return (
		<CommandDialog
			open={open}
			onOpenChange={setOpen}
			title="Search chats"
			description="Search your conversations by title."
			showCloseButton={false}
			className="top-[30%] translate-y-0 sm:max-w-xl"
		>
			<Command shouldFilter={false}>
				<CommandInput
					placeholder="Search chats or press Enter to start a new chat..."
					value={query}
					onValueChange={setQuery}
				/>
				<CommandList>
					{!hasQuery ? (
						<>
							<CommandGroup heading="Actions">
								<CommandItem
									value="new-chat"
									onSelect={handleNewChat}
									className="h-9"
								>
									<PlusIcon />
									<span className="truncate">New chat</span>
									<CornerDownLeftIcon className="ml-auto size-3.5 opacity-50" />
								</CommandItem>
							</CommandGroup>
							<CommandSeparator />
						</>
					) : null}
					<CommandGroup heading={searching ? "Chats" : "Recent"}>
						{loading && results.length === 0 ? (
							<div className="space-y-1 px-2 py-3">
								{["s-1", "s-2", "s-3"].map((key) => (
									<div
										key={key}
										className="h-5 w-full animate-pulse rounded bg-muted-foreground/15"
									/>
								))}
							</div>
						) : results.length === 0 ? (
							<div className="px-2 py-6 text-center text-sm text-muted-foreground">
								{searching ? (
									<>No chats found for “{debouncedQuery.trim()}”.</>
								) : (
									"No chats yet. Start a new one above."
								)}
							</div>
						) : (
							results.map((thread) => (
								<CommandItem
									key={thread._id}
									value={thread._id}
									onSelect={() => handleSelectThread(thread._id)}
									className="h-9"
								>
									<MessageSquareIcon />
									<span className="min-w-0 flex-1 truncate">
										{thread.title}
									</span>
									<span className="shrink-0 text-xs text-muted-foreground">
										{formatRelativeTime(thread.updatedAt)}
									</span>
								</CommandItem>
							))
						)}
					</CommandGroup>
				</CommandList>
				<div className="flex items-center justify-between gap-4 border-t px-3 py-2 text-xs text-muted-foreground">
					<span className="inline-flex items-center gap-1.5">
						<SearchIcon className="size-3.5" />
						Search thread titles
					</span>
					<span className="hidden items-center gap-3 sm:inline-flex">
						<span className="inline-flex items-center gap-1">
							<KbdGroup>
								<Kbd>↑</Kbd>
								<Kbd>↓</Kbd>
							</KbdGroup>
							to navigate
						</span>
						<span className="inline-flex items-center gap-1">
							<Kbd>↵</Kbd> to open
						</span>
						<span className="inline-flex items-center gap-1">
							<Kbd>Esc</Kbd> to close
						</span>
					</span>
				</div>
			</Command>
		</CommandDialog>
	);
}
