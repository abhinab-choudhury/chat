import { createFileRoute } from "@tanstack/react-router";
import {
	CodeIcon,
	CompassIcon,
	GraduationCapIcon,
	ImageIcon,
	LogInIcon,
	MenuIcon,
	MessageSquareIcon,
	PanelLeftIcon,
	PlusIcon,
	SearchIcon,
	SendIcon,
	SettingsIcon,
	SparklesIcon,
	UserIcon,
	WandIcon,
} from "lucide-react";
import * as React from "react";
import { ThemeToggle } from "#/components/theme-toggle";

export const Route = createFileRoute("/landing")({
	component: LandingPage,
});

const THREAD_GROUPS = [
	{
		label: "Today",
		items: [
			{ id: "1", title: "Refactor authentication flow" },
			{ id: "2", title: "Landing page redesign ideas" },
		],
	},
	{
		label: "Older",
		items: [
			{ id: "3", title: "TanStack Router setup notes" },
			{ id: "4", title: "Drizzle schema review" },
		],
	},
];

const QUICK_PILLS = [
	{ label: "Create", icon: WandIcon },
	{ label: "Explore", icon: CompassIcon },
	{ label: "Code", icon: CodeIcon },
	{ label: "Learn", icon: GraduationCapIcon },
];

const SUGGESTED_PROMPTS = [
	"Summarize the latest changes in my repository",
	"Draft a responsive landing page hero section",
	"Explain TanStack Router file-based routing",
	"Generate SQL for a user activity report",
];

function LandingPage() {
	const [sidebarOpen, setSidebarOpen] = React.useState(false);
	const [message, setMessage] = React.useState("");
	const textareaRef = React.useRef<HTMLTextAreaElement>(null);

	const resizeTextarea = React.useCallback(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: resizeTextarea stable
	React.useEffect(() => {
		resizeTextarea();
	}, [message, resizeTextarea]);

	const hasThreads = THREAD_GROUPS.some((g) => g.items.length > 0);

	return (
		<div className="landing-root min-h-screen bg-background text-foreground">
			<style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        .landing-root { font-family: 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif; }
      `}</style>

			{sidebarOpen ? (
				<button
					type="button"
					aria-label="Close sidebar"
					className="fixed inset-0 z-30 bg-black/40 md:hidden"
					onClick={() => setSidebarOpen(false)}
				/>
			) : null}

			<div className="flex h-screen overflow-hidden">
				{/* Sidebar */}
				<aside
					className={`fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-transform duration-300 md:static md:translate-x-0 ${
						sidebarOpen ? "translate-x-0" : "-translate-x-full"
					}`}
				>
					<div className="flex items-center justify-between px-4 py-4">
						<span className="text-lg font-extrabold tracking-tight">
							app.chat
						</span>
						<button
							type="button"
							aria-label="Collapse sidebar"
							className="flex size-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
						>
							<PanelLeftIcon className="size-4" />
						</button>
					</div>

					<div className="px-3">
						<button
							type="button"
							className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
						>
							<PlusIcon className="size-4" />
							New Chat
						</button>
					</div>

					<div className="px-3 pt-3">
						<div className="relative">
							<SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<input
								type="text"
								placeholder="Search threads"
								className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-14 text-sm outline-none transition focus:ring-2 focus:ring-ring"
							/>
							<kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
								⌘K
							</kbd>
						</div>
					</div>

					<div className="mt-4 flex-1 overflow-y-auto px-3 pb-4">
						{hasThreads ? (
							THREAD_GROUPS.map((group) => (
								<div key={group.label} className="mb-4">
									<p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										{group.label}
									</p>
									<ul className="space-y-1">
										{group.items.map((thread) => (
											<li key={thread.id}>
												<button
													type="button"
													className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition hover:bg-accent hover:text-accent-foreground"
												>
													<MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" />
													<span className="truncate">{thread.title}</span>
												</button>
											</li>
										))}
									</ul>
								</div>
							))
						) : (
							<div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
								No threads found
							</div>
						)}
					</div>

					<div className="border-t border-border p-3">
						<div className="flex items-center gap-3">
							<div className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
								JD
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-semibold">Jane Doe</p>
								<p className="truncate text-xs text-muted-foreground">
									jane@studio.dev
								</p>
							</div>
							<div className="flex items-center gap-1">
								<button
									type="button"
									aria-label="Settings"
									className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
								>
									<SettingsIcon className="size-4" />
								</button>
								<button
									type="button"
									aria-label="Profile"
									className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
								>
									<UserIcon className="size-4" />
								</button>
							</div>
						</div>
					</div>
				</aside>

				{/* Main */}
				<main className="relative flex flex-1 flex-col">
					<header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
						<div className="flex items-center gap-2">
							<button
								type="button"
								aria-label="Open sidebar"
								className="flex size-10 items-center justify-center rounded-xl border border-border text-muted-foreground transition hover:bg-accent hover:text-accent-foreground md:hidden"
								onClick={() => setSidebarOpen(true)}
							>
								<MenuIcon className="size-5" />
							</button>
							<button
								type="button"
								aria-label="Toggle sidebar"
								className="hidden size-10 items-center justify-center rounded-xl border border-border text-muted-foreground transition hover:bg-accent hover:text-accent-foreground md:flex"
								onClick={() => setSidebarOpen((v) => !v)}
							>
								<PanelLeftIcon className="size-5" />
							</button>
						</div>

						<div className="flex items-center gap-2">
							<ThemeToggle />
							<button
								type="button"
								className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
							>
								<LogInIcon className="size-4" />
								Sign In
							</button>
						</div>
					</header>

					<div className="flex flex-1 flex-col items-center justify-center px-4 pb-40 pt-10">
						<div className="mb-6 flex size-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
							<SparklesIcon className="size-8" />
						</div>
						<h1 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
							How can I help you today?
						</h1>
						<p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
							app.chat — your AI workspace for writing, exploring, coding, and
							learning.
						</p>

						<div className="mt-8 flex flex-wrap items-center justify-center gap-3">
							{QUICK_PILLS.map(({ label, icon: Icon }) => (
								<button
									key={label}
									type="button"
									className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground shadow-sm transition hover:-translate-y-0.5 hover:bg-accent"
								>
									<Icon className="size-4" />
									{label}
								</button>
							))}
						</div>

						<div className="mt-8 w-full max-w-2xl space-y-3">
							{SUGGESTED_PROMPTS.map((prompt) => (
								<button
									key={prompt}
									type="button"
									onClick={() => setMessage(prompt)}
									className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm text-card-foreground shadow-sm transition hover:bg-accent"
								>
									<ImageIcon className="size-4 shrink-0 text-muted-foreground" />
									<span className="truncate">{prompt}</span>
								</button>
							))}
						</div>
					</div>

					{/* Floating input dock */}
					<div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-6">
						<div className="pointer-events-auto w-full max-w-[768px] rounded-3xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
							<textarea
								ref={textareaRef}
								value={message}
								onChange={(e) => setMessage(e.target.value)}
								placeholder="Type your message here..."
								rows={1}
								className="max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
							/>
							<div className="mt-2 flex items-center justify-between gap-2">
								<div className="flex flex-wrap items-center gap-2">
									<select
										aria-label="Model selector"
										className="h-9 rounded-xl border border-border bg-background px-3 text-xs font-medium outline-none"
										defaultValue="gpt-4o"
									>
										<option value="gpt-4o">GPT-4o</option>
										<option value="claude">Claude 3.5</option>
										<option value="gemini">Gemini 1.5</option>
									</select>
									{["Instant", "Search", "Attach file"].map((toggle) => (
										<button
											key={toggle}
											type="button"
											className="flex h-9 items-center rounded-xl border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
										>
											{toggle}
										</button>
									))}
								</div>
								<button
									type="button"
									aria-label="Send message"
									className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition hover:opacity-90"
								>
									<SendIcon className="size-4" />
								</button>
							</div>
						</div>
					</div>
				</main>
			</div>
		</div>
	);
}
