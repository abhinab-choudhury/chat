import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppSidebar } from "#/components/app-sidebar";
import { ThemeToggle } from "#/components/theme-toggle";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "#/components/ui/sidebar";

export const Route = createFileRoute("/_chat")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<header className="flex h-12 items-center gap-2 border-b border-border px-4">
					<SidebarTrigger className="-ml-1" />
					<div className="ml-auto flex items-center gap-2">
						<ThemeToggle />
					</div>
				</header>
				<Outlet />
			</SidebarInset>
		</SidebarProvider>
	);
}
