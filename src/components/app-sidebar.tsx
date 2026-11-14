import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
	LogOutIcon,
	MessageSquareIcon,
	PlusIcon,
	SettingsIcon,
	UserIcon,
} from "lucide-react";
import { Button } from "#/components/ui/button";
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
import { getCurrentUserId } from "#/lib/user-id";
import { useChatStore } from "#/store/chat-store";
import { api } from "../../convex/_generated/api";

export function AppSidebar() {
	const { state } = useSidebar();
	const collapsed = state === "collapsed";
	const navigate = useNavigate();
	const location = useLocation();
	const { user, isPending } = useSession();
	const generatingTitleThreadIds = useChatStore(
		(s) => s.generatingTitleThreadIds,
	);

	const userId = isPending ? null : (user?.id ?? getCurrentUserId(null));
	const threads = useQuery(
		api.threads.listThreads,
		userId ? { userId } : "skip",
	);

	const handleSignOut = async () => {
		await authClient.signOut();
		void navigate({ to: "/" });
	};

	const handleNewChat = () => {
		void navigate({ to: "/" });
	};

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader className="flex flex-row items-center gap-2 px-2 py-3">
				{!collapsed ? (
					<div className="text-3xl font-bold mx-1.5">.Chat</div>
				) : null}
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<Button
							className="w-full justify-start"
							variant="default"
							onClick={handleNewChat}
						>
							<PlusIcon className="mr-2 size-4" />
							{!collapsed ? "New chat" : null}
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
										<SidebarMenuItem key={thread._id}>
											<div className="flex items-center gap-1">
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
														<MessageSquareIcon className="size-4" />
														{!collapsed ? (
															generatingTitleThreadIds.includes(thread._id) ? (
																<span className="inline-flex min-w-0 flex-1 items-center gap-2">
																	<span className="truncate text-muted-foreground">
																		{thread.title}
																	</span>
																	<span className="h-3 w-14 shrink-0 animate-pulse rounded bg-muted-foreground/20" />
																</span>
															) : (
																<span className="truncate">{thread.title}</span>
															)
														) : null}
													</Link>
												</SidebarMenuButton>
											</div>
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
		</Sidebar>
	);
}
