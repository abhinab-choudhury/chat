import { useNavigate } from "@tanstack/react-router";

import { authClient } from "#/lib/auth-client";
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
import { Button } from "#/components/ui/button";
import {
	LogOutIcon,
	MessageSquareIcon,
	PlusIcon,
	SettingsIcon,
	UserIcon,
} from "lucide-react";

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
				<div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
					<img src="icon.png" className="bg-white p-1 rounded-sm" />
				</div>
				{!collapsed ? <span className="font-semibold">Chat</span> : null}
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
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton tooltip="Settings">
							<SettingsIcon className="size-4" />
							{!collapsed ? <span>Settings</span> : null}
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						{session?.user ? (
							<SidebarMenuButton
								tooltip={session.user.name || session.user.email || "Account"}
							>
								<UserIcon className="size-4" />
								{!collapsed ? (
									<span className="truncate">
										{session.user.name || session.user.email}
									</span>
								) : null}
							</SidebarMenuButton>
						) : (
							<SidebarMenuButton
								tooltip="Sign in"
								onClick={() => void navigate({ to: "/login" })}
							>
								<UserIcon className="size-4" />
								{!collapsed ? <span>Sign in</span> : null}
							</SidebarMenuButton>
						)}
					</SidebarMenuItem>
					{session?.user ? (
						<SidebarMenuItem>
							<SidebarMenuButton
								tooltip="Sign out"
								onClick={() => void handleSignOut()}
							>
								<LogOutIcon className="size-4" />
								{!collapsed ? <span>Sign out</span> : null}
							</SidebarMenuButton>
						</SidebarMenuItem>
					) : null}
				</SidebarMenu>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
