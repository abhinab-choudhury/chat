import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppSidebar } from "#/components/app-sidebar";
import { ThemeToggle } from "#/components/theme-toggle";
import { getSession } from "#/lib/auth.functions";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "#/components/ui/sidebar";

export const Route = createFileRoute("/_chat")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/login" });
		}
	},
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="min-h-0 overflow-hidden">
				<header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
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
