import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import {
	LogOutIcon,
	MessageSquareIcon,
	PencilIcon,
	PlusIcon,
	SearchIcon,
	SettingsIcon,
	Trash2Icon,
	UserIcon,
} from "lucide-react";
import * as React from "react";
import { Logo, LogoSymbol } from "#/components/logo";
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
import { useSession } from "#/hooks/auth-hooks";
import { authClient } from "#/lib/auth-client";
import { useDiskCachedQuery } from "#/lib/convex-cached-query";
import { shortcutDisplay, shortcutKeys } from "#/lib/shortcuts";
import { getCurrentUserId } from "#/lib/user-id";
import { cn as classNames } from "#/lib/utils";
import { useChatStore } from "#/store/chat-store";
import { useModelStore } from "#/store/model-store";
import { useSearchStore } from "#/store/search-store";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function AppSidebar() {
	const { state, setOpenMobile } = useSidebar();
	const collapsed = state === "collapsed";
	const navigate = useNavigate();
	const location = useLocation();
	const { user, isPending, refetch } = useSession();
	const [signingOut, setSigningOut] = React.useState(false);
	const [renamingThread, setRenamingThread] = React.useState<{
		id: Id<"threads">;
		title: string;
	} | null>(null);
	const generatingTitleThreadIds = useChatStore(
		(s) => s.generatingTitleThreadIds,
	);
	const shortcuts = useModelStore((s) => s.shortcuts);

	const userId = isPending ? null : (user?.id ?? getCurrentUserId(null));
	const threads = useDiskCachedQuery(
		api.threads.listThreads,
		{
			key: userId ? `threads:${userId}` : "threads:anon",
			default: [],
		},
		userId ? { userId } : "skip",
	);

	const handleSignOut = async () => {
		if (signingOut) return;
		setSigningOut(true);
		try {
			await authClient.signOut();
			await refetch();
			void navigate({ to: "/" });
		} finally {
			setSigningOut(false);
		}
	};

	const deleteThread = useMutation(api.threads.deleteThread);
	const renameThread = useMutation(api.threads.renameThread);
	const handleDeleteThread = (threadId: Id<"threads">) => {
		if (!userId) return;
		void deleteThread({ threadId, userId });
	};

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
														"pointer-events-none -translate-x-2 opacity-0",
														"transition-[opacity,transform] duration-200 ease-out",
														"group-hover/thread:pointer-events-auto group-hover/thread:translate-x-0 group-hover/thread:opacity-100",
														"group-focus-within/thread:pointer-events-auto group-focus-within/thread:translate-x-0 group-focus-within/thread:opacity-100",
														"max-md:pointer-events-auto max-md:translate-x-0 max-md:opacity-100",
													)}
												>
													<Button
														variant="ghost"
														size="icon"
														className="size-7 shrink-0"
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
														className="size-7 shrink-0 hover:bg-destructive/10 hover:text-destructive"
														onClick={(e) => {
															e.preventDefault();
															e.stopPropagation();
															handleDeleteThread(thread._id);
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
				<div className="flex flex-col gap-1 p-2">
					{user ? (
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
					) : (
						<Button
							variant="ghost"
							size="sm"
							className="w-full justify-start"
							disabled
							title="Settings (locked)"
						>
							<SettingsIcon className="mr-2 size-4" />
							{!collapsed ? <span>Settings</span> : null}
						</Button>
					)}
					{user ? (
						<>
							<Button
								variant="ghost"
								size="sm"
								className="w-full justify-start"
								title={user.name || user.email || "Account"}
							>
								<UserIcon className="mr-2 size-4" />
								{!collapsed ? (
									<span className="truncate">{user.name || user.email}</span>
								) : null}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								className="w-full justify-start"
								title="Sign out"
								disabled={signingOut}
								onClick={() => void handleSignOut()}
							>
								<LogOutIcon className="mr-2 size-4" />
								{!collapsed ? <span>Sign out</span> : null}
							</Button>
						</>
					) : (
						<Button
							asChild
							variant="ghost"
							size="sm"
							className="w-full justify-start"
							title="Sign in"
						>
							<Link to="/login">
								<UserIcon className="mr-2 size-4" />
								{!collapsed ? <span>Sign in</span> : null}
							</Link>
						</Button>
					)}
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
		</Sidebar>
	);
}
