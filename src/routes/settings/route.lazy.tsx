import {
	createLazyFileRoute,
	Link,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import {
	ArrowLeft,
	BarChart3,
	Bot,
	Box,
	Globe,
	Key,
	PaintBucket,
	User,
} from "lucide-react";
import * as React from "react";
import { SettingsLayout } from "#/components/settings/settings-layout";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { useSession } from "#/hooks/auth-hooks";
import { RouteErrorComponent } from "#/components/route-error";
import { cn } from "#/lib/utils";

const settingsNavItems = [
	{ title: "Profile", href: "/settings/profile", icon: User },
	{ title: "API Keys", href: "/settings/api-keys", icon: Key },
	{ title: "Models", href: "/settings/models", icon: Box },
	{ title: "AI Options", href: "/settings/ai-options", icon: Bot },
	{ title: "Features", href: "/settings/features", icon: Globe },
	{ title: "Usage", href: "/settings/usage", icon: BarChart3 },
	{ title: "Appearance", href: "/settings/appearance", icon: PaintBucket },
];

export const Route = createLazyFileRoute("/settings")({
	component: SettingsPage,
	errorComponent: RouteErrorComponent,
});

function Inner() {
	const { user, isPending } = useSession();

	if (isPending) {
		return (
			<SettingsLayout
				title="Settings"
				description="Manage your account preferences and configuration."
			>
				<Skeleton className="h-10 w-full" />
			</SettingsLayout>
		);
	}

	if (!user) {
		return (
			<SettingsLayout
				title="Settings"
				description="Manage your account preferences and configuration."
			>
				<p className="text-sm text-muted-foreground">
					Sign in to manage your settings.
				</p>
			</SettingsLayout>
		);
	}

	return <Outlet />;
}

function SettingsPage() {
	const location = useLocation();
	const navigate = useNavigate();
	const { user, isPending } = useSession();

	React.useEffect(() => {
		if (!isPending && !user) {
			void navigate({ to: "/login" });
		}
	}, [isPending, user, navigate]);

	React.useEffect(() => {
		if (
			location.pathname === "/settings" ||
			location.pathname === "/settings/"
		) {
			void navigate({ to: "/settings/profile", replace: true });
		}
	}, [location.pathname, navigate]);

	return (
		<div className="flex h-screen flex-col overflow-y-auto bg-background">
			<div className="container mx-auto flex max-w-6xl flex-1 flex-col p-3 pb-6 lg:max-h-dvh lg:overflow-y-hidden lg:p-6">
				<div className="mb-8 max-md:px-2">
					<div className="mb-6 flex items-center gap-4">
						<Link to="/">
							<Button
								variant="ghost"
								size="sm"
								className="gap-2 text-muted-foreground hover:text-foreground"
							>
								<ArrowLeft className="h-4 w-4" />
								Back
							</Button>
						</Link>
					</div>

					<div className="space-y-1">
						<h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
						<p className="text-muted-foreground">
							Manage your account preferences and configuration.
						</p>
					</div>
				</div>

				<div className="grid w-full grid-cols-1 gap-8 lg:grid-cols-4">
					<div className="w-full shrink-0 lg:w-64 lg:pr-2">
						<nav className="w-full space-y-1">
							{settingsNavItems.map((item) => {
								const isActive = location.pathname === item.href;
								const Icon = item.icon;
								return (
									<Link
										key={item.href}
										to={item.href}
										className={cn(
											"flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
											isActive
												? "bg-muted text-foreground"
												: "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
										)}
									>
										<Icon className="h-4 w-4" />
										{item.title}
									</Link>
								);
							})}
						</nav>
					</div>

					<div className="col-span-3 flex-1">
						<div className="space-y-6 p-0.5 lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto">
							<Inner />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
