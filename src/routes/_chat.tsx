import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { AppSidebar } from "#/components/app-sidebar";
import { ThemeToggle } from "#/components/theme-toggle";
import { SearchThreadsDialog } from "#/components/thread/search-threads-dialog";
import { Button } from "#/components/ui/button";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "#/components/ui/sidebar";
import { useKeyboardShortcuts } from "#/hooks/use-keyboard-shortcuts";
import { useSearchStore } from "#/store/search-store";

export const Route = createFileRoute("/_chat")({
	component: RouteComponent,
});

function RouteComponent() {
	const setSearchOpen = useSearchStore((s) => s.setOpen);
	useKeyboardShortcuts();

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="min-h-0 overflow-hidden">
				<header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
					<div className="flex items-center overflow-hidden rounded-md border border-border">
						<SidebarTrigger className="rounded-none border-0" />
						<Button
							variant="ghost"
							size="icon"
							className="size-7 rounded-none border-l border-border"
							onClick={() => setSearchOpen(true)}
							title="Search chats"
							aria-label="Search chats"
						>
							<SearchIcon className="size-4" />
						</Button>
					</div>
					<div className="ml-auto flex items-center gap-2">
						<ThemeToggle />
					</div>
				</header>
				<Outlet />
			</SidebarInset>
			<SearchThreadsDialog />
		</SidebarProvider>
	);
}
