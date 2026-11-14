import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
	LogOutIcon,
	MessageSquareIcon,
	PlusIcon,
	SettingsIcon,
	UserIcon,
} from "lucide-react";
import * as React from "react";
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
import { useDiskCachedQuery } from "#/lib/convex-cached-query";
import { getCurrentUserId } from "#/lib/user-id";
import { useChatStore } from "#/store/chat-store";
import { api } from "../../convex/_generated/api";

export function AppSidebar() {
	const { state } = useSidebar();
	const collapsed = state === "collapsed";
	const navigate = useNavigate();
	const location = useLocation();
	const { user, isPending, refetch } = useSession();
	const [signingOut, setSigningOut] = React.useState(false);
	const generatingTitleThreadIds = useChatStore(
		(s) => s.generatingTitleThreadIds,
	);

	const userId = isPending ? null : (user?.id ?? getCurrentUserId(null));
	const threads = useDiskCachedQuery(
		api.threads.listThreads,
		{
			key: userId ? `threads:${userId}` : "threads:anon",
			default: [] as any,
		},
		userId ? { userId } : "skip",
	) as any;

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
								.filter((t: any) => !t.archived)
								.map((thread: any) => {
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
																<span
																	className="inline-flex min-w-0 flex-1 items-center"
																	aria-hidden="true"
																>
																	<span className="h-3.5 w-24 animate-pulse rounded bg-muted-foreground/20" />
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
								threads.filter((t: any) => !t.archived).length === 0) && (
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
		</Sidebar>
	);
}
