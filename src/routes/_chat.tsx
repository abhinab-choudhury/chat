import { createFileRoute } from "@tanstack/react-router";
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
				<main className="flex flex-1 flex-col gap-4 p-4">
					<div className="flex items-center gap-2">
						<SidebarTrigger className="-ml-1" />
						<ThemeToggle />
					</div>
					<div className="rounded-lg border bg-card p-6 text-card-foreground">
						<h2 className="text-2xl font-bold">Welcome to Chat</h2>
						<p className="mt-2 text-muted-foreground">
							Start a conversation from the sidebar.
						</p>
					</div>
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
