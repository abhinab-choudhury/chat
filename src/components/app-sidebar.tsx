import { Link, useLocation, useNavigate } from "@tanstack/react-router";
// convex removed
import {
	BookOpenIcon,
	MessageSquareIcon,
	PencilIcon,
	PlusIcon,
	SearchIcon,
	SettingsIcon,
	Trash2Icon,
} from "lucide-react";
import * as React from "react";
import { Logo, LogoSymbol } from "#/components/logo";
import { DeleteThreadDialog } from "#/components/thread/delete-thread-dialog";
import { RenameThreadDialog } from "#/components/thread/rename-thread-dialog";
import { Button } from "#/components/ui/button";
import { Kbd, KbdGroup } from "#/components/ui/kbd";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	SidebarSeparator,
	useSidebar,
} from "#/components/ui/sidebar";
import { chatData, useThreads } from "#/lib/chat-data";
import { shortcutDisplay, shortcutKeys } from "#/lib/shortcuts";
import { getCurrentUserId } from "#/lib/user-id";
import { cn as classNames } from "#/lib/utils";
import { useChatStore } from "#/store/chat-store";
import { useModelStore } from "#/store/model-store";
import { useSearchStore } from "#/store/search-store";
// types from chat-data

export function AppSidebar() {
	const { state, setOpenMobile } = useSidebar();
	const collapsed = state === "collapsed";
	const navigate = useNavigate();
	const location = useLocation();
	const [renamingThread, setRenamingThread] = React.useState<{
		id: string;
		title: string;
	} | null>(null);
	const [deletingThread, setDeletingThread] = React.useState<{
		id: string;
		title: string;
	} | null>(null);
	const generatingTitleThreadIds = useChatStore(
		(s) => s.generatingTitleThreadIds,
	);
	const shortcuts = useModelStore((s) => s.shortcuts);

	const userId = getCurrentUserId();
	const threadsRaw = useThreads(userId);
	const threads = threadsRaw as unknown as Array<{
		_id: string;
		title: string;
		archived?: boolean;
		updatedAt?: number;
	}>;

	const handleDeleteThread = (threadId: string) => {
		if (!userId) return;
		void chatData.deleteThread({ threadId, userId }).then(() => {
			if (location.pathname === `/thread/${threadId}`) {
				void navigate({ to: "/" });
			}
		});
	};

	const renameThread = (args: { threadId: string; title: string }) =>
		chatData.renameThread(args);

	const handleNewChat = () => {
		void navigate({ to: "/" });
	};

	const handleOpenSearch = () => {
		setOpenMobile(false);
		useSearchStore.getState().setOpen(true);
	};

	return (
		<Sidebar collapsible="offcanvas">
			<SidebarHeader className="flex flex-col gap-2 px-2 py-3">
				{!collapsed ? (
					<Logo className="mx-1.5" />
				) : (
					<div className="flex justify-center">
						<LogoSymbol />
					</div>
				)}
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent className="flex flex-col gap-2">
						<Button
							className={classNames(
								"w-full",
								collapsed
									? "size-8 shrink-0 justify-center p-0"
									: "justify-start",
							)}
							variant="default"
							onClick={handleNewChat}
							title={`New chat (${shortcutDisplay(shortcuts.newChat)})`}
							aria-label="New chat"
						>
							<PlusIcon className="size-4 shrink-0" />
							{!collapsed ? (
								<>
									<span>New chat</span>
									<KbdGroup className="ml-auto">
										{shortcutKeys(shortcuts.newChat).map((key) => (
											<Kbd key={key}>{key}</Kbd>
										))}
									</KbdGroup>
								</>
							) : null}
						</Button>
						<Button
							variant="outline"
							className={classNames(
								"w-full",
								collapsed
									? "size-8 shrink-0 justify-center p-0"
									: "justify-start",
							)}
							onClick={handleOpenSearch}
							title={`Search chats (${shortcutDisplay(shortcuts.search)})`}
							aria-label="Search chats"
						>
							<SearchIcon className="size-4 shrink-0" />
							{!collapsed ? (
								<>
									<span className="truncate">Search chats</span>
									<KbdGroup className="ml-auto">
										{shortcutKeys(shortcuts.search).map((key) => (
											<Kbd key={key}>{key}</Kbd>
										))}
									</KbdGroup>
								</>
							) : null}
						</Button>
					</SidebarGroupContent>
				</SidebarGroup>
				<SidebarSeparator />
				<SidebarGroup>
					<SidebarGroupLabel>Recent</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{(threads ?? [])
								.filter((t) => !t.archived)
								.map((thread) => {
									const isActive =
										location.pathname === `/thread/${thread._id}`;
									return (
										<SidebarMenuItem key={thread._id} className="group/thread">
											<SidebarMenuButton
												asChild
												tooltip={thread.title}
												isActive={isActive}
												className="flex-1"
											>
												<Link
													to="/thread/$threadId"
													params={{ threadId: thread._id }}
												>
													{collapsed ? (
														<MessageSquareIcon className="size-4" />
													) : generatingTitleThreadIds.includes(thread._id) ? (
														<span
															className="inline-flex min-w-0 flex-1 items-center"
															aria-hidden="true"
														>
															<span className="h-3.5 w-24 animate-pulse rounded bg-muted-foreground/20" />
														</span>
													) : (
														<span className="truncate">{thread.title}</span>
													)}
												</Link>
											</SidebarMenuButton>
											{!collapsed ? (
												<div
													className={classNames(
														"absolute inset-y-0 right-0 flex items-center gap-0.5 rounded-r-md pr-1 pl-6",
														"bg-linear-to-l from-sidebar-accent from-60% to-transparent",
														"opacity-70 transition-opacity duration-200",
														"group-hover/thread:opacity-100",
														"group-focus-within/thread:opacity-100",
														"max-md:opacity-100",
													)}
												>
													<Button
														variant="ghost"
														size="icon"
														className="size-7 shrink-0 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:text-foreground/90"
														onClick={(e) => {
															e.preventDefault();
															e.stopPropagation();
															setRenamingThread({
																id: thread._id,
																title: thread.title,
															});
														}}
														aria-label="Rename thread"
													>
														<PencilIcon className="size-3.5" />
													</Button>
													<Button
														variant="ghost"
														size="icon"
														className="size-7 shrink-0 text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive dark:text-red-400 dark:hover:bg-destructive/20 dark:hover:text-red-300"
														onClick={(e) => {
															e.preventDefault();
															e.stopPropagation();
															setDeletingThread({
																id: thread._id,
																title: thread.title,
															});
														}}
														aria-label="Delete thread"
													>
														<Trash2Icon className="size-3.5" />
													</Button>
												</div>
											) : null}
										</SidebarMenuItem>
									);
								})}
							{(!threads ||
								threads.filter((t) => !t.archived).length === 0) && (
								<SidebarMenuItem>
									<SidebarMenuButton tooltip="No conversations yet">
										{!collapsed ? <span>No conversations yet</span> : null}
									</SidebarMenuButton>
								</SidebarMenuItem>
							)}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<Button
					variant="ghost"
					className="justify-start"
					onClick={() => {
						void navigate({ to: "/library" });
						setOpenMobile(false);
					}}
					title="Memory"
				>
					<BookOpenIcon className="mr-2 size-4" />
					{!collapsed && "Memory"}
				</Button>
				<div className="flex flex-col gap-1 p-2">
					<Button
						asChild
						variant="ghost"
						size="sm"
						className="w-full justify-start"
						title="Settings"
					>
						<Link to="/settings">
							<SettingsIcon className="mr-2 size-4" />
							{!collapsed ? <span>Settings</span> : null}
						</Link>
					</Button>
				</div>
			</SidebarFooter>
			<SidebarRail />
			<RenameThreadDialog
				open={renamingThread !== null}
				initialTitle={renamingThread?.title ?? ""}
				onOpenChange={(open) => {
					if (!open) setRenamingThread(null);
				}}
				onRename={(title) => {
					if (!renamingThread) return;
					void renameThread({
						threadId: renamingThread.id,
						title,
					});
					setRenamingThread(null);
				}}
			/>
			<DeleteThreadDialog
				open={deletingThread !== null}
				threadTitle={deletingThread?.title}
				onOpenChange={(open) => {
					if (!open) setDeletingThread(null);
				}}
				onConfirm={() => {
					if (!deletingThread) return;
					handleDeleteThread(deletingThread.id);
					setDeletingThread(null);
				}}
			/>
		</Sidebar>
	);
}
