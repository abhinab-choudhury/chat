import { Link, useNavigate } from "@tanstack/react-router";
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
import { authClient } from "#/lib/auth-client";
import { AppIcon } from "./brand-icons";

export function AppSidebar() {
	const { state } = useSidebar();
	const collapsed = state === "collapsed";
	const navigate = useNavigate();
	const { data: session } = authClient.useSession();

	const handleSignOut = async () => {
		await authClient.signOut();
		void navigate({ to: "/login" });
	};

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader className="flex flex-row items-center gap-2 px-2 py-3">
				{!collapsed ? <div className="text-3xl font-bold mx-1.5">.Chat</div> : null}
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<Button className="w-full justify-start" variant="default">
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
							<SidebarMenuItem>
								<SidebarMenuButton tooltip="No conversations yet">
									<MessageSquareIcon className="size-4" />
									{!collapsed ? <span>No conversations yet</span> : null}
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<div className="flex flex-col gap-1 p-2">
					{session?.user ? (
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
					{session?.user ? (
						<>
							<Button
								variant="ghost"
								size="sm"
								className="w-full justify-start"
								title={session.user.name || session.user.email || "Account"}
							>
								<UserIcon className="mr-2 size-4" />
								{!collapsed ? (
									<span className="truncate">
										{session.user.name || session.user.email}
									</span>
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
