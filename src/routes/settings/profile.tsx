import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
	Edit,
	Globe,
	Laptop,
	LogOut,
	Save,
	Smartphone,
	Tablet,
	UserX,
	X,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { SettingsLayout } from "#/components/settings/settings-layout";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Separator } from "#/components/ui/separator";
import {
	useListSessions,
	useRevokeOtherSessions,
	useRevokeSession,
	useSession,
	useUpdateUser,
} from "#/hooks/auth-hooks";
import { authClient } from "#/lib/auth-client";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/settings/profile")({
	component: UserAccountSettings,
});

function UserAccountSettings() {
	const { user, isPending: sessionLoading, refetch: refetchSession } = useSession();
	const { data: sessionData } = authClient.useSession();
	const { data: sessions = [], isPending: sessionsLoading } = useListSessions();
	const updateUser = useUpdateUser();
	const revokeSession = useRevokeSession();
	const revokeOtherSessions = useRevokeOtherSessions();
	const router = useRouter();

	const [isEditingName, setIsEditingName] = React.useState(false);
	const [nameValue, setNameValue] = React.useState("");
	const [signingOut, setSigningOut] = React.useState(false);
	const busyRef = React.useRef(false);

	const isAuthBusy =
		signingOut ||
		updateUser.isPending ||
		revokeSession.isPending ||
		revokeOtherSessions.isPending;

	const displayName = React.useMemo(() => {
		if (user?.name?.trim()) return user.name;
		return user?.email?.split("@")[0] || null;
	}, [user?.name, user?.email]);

	const handleEditName = React.useCallback(() => {
		if (busyRef.current || isAuthBusy) return;
		setNameValue(displayName || "");
		setIsEditingName(true);
	}, [displayName, isAuthBusy]);

	const handleSaveName = React.useCallback(async () => {
		if (busyRef.current || isAuthBusy) return;
		if (!nameValue.trim()) {
			toast.error("Name cannot be empty");
			return;
		}
		busyRef.current = true;
		try {
			await updateUser.mutateAsync({ name: nameValue.trim() });
			setIsEditingName(false);
			toast.success("Name updated successfully");
		} catch (error) {
			toast.error("Failed to update name");
			console.error("Error updating name:", error);
		} finally {
			busyRef.current = false;
		}
	}, [nameValue, updateUser, isAuthBusy]);

	const handleCancelEdit = React.useCallback(() => {
		if (busyRef.current || isAuthBusy) return;
		setIsEditingName(false);
		setNameValue("");
	}, [isAuthBusy]);

	const handleRevokeSession = React.useCallback(
		async (sessionId: string) => {
			if (busyRef.current || isAuthBusy) return;
			busyRef.current = true;
			try {
				await revokeSession.mutateAsync({ sessionId });
				toast.success("Session revoked successfully");
			} catch (error) {
				toast.error("Failed to revoke session");
				console.error("Error revoking session:", error);
			} finally {
				busyRef.current = false;
			}
		},
		[revokeSession, isAuthBusy],
	);

	const handleSignOut = React.useCallback(async () => {
		if (busyRef.current || isAuthBusy) return;
		busyRef.current = true;
		setSigningOut(true);
		try {
			await authClient.signOut();
			await refetchSession();
			toast.success("Signed out successfully");
			void router.navigate({ to: "/login" });
		} catch (error) {
			toast.error("Failed to sign out");
			console.error("Error signing out:", error);
		} finally {
			setSigningOut(false);
			busyRef.current = false;
		}
	}, [router, isAuthBusy]);

	const handleRevokeOtherSessions = React.useCallback(async () => {
		if (busyRef.current || isAuthBusy) return;
		busyRef.current = true;
		try {
			await revokeOtherSessions.mutateAsync({});
			toast.success("All other sessions revoked successfully");
		} catch (error) {
			toast.error("Failed to revoke other sessions");
			console.error("Error revoking other sessions:", error);
		} finally {
			busyRef.current = false;
		}
	}, [revokeOtherSessions, isAuthBusy]);

	const getDeviceInfo = React.useCallback(
		(userAgent: string | null | undefined) => {
			const ua = userAgent || "";
			let icon = Globe;
			let deviceType = "Unknown";
			let browser = "Unknown Browser";
			let os = "";

			if (/mobile/i.test(ua)) {
				icon = Smartphone;
				deviceType = "Mobile";
			} else if (/tablet|ipad/i.test(ua)) {
				icon = Tablet;
				deviceType = "Tablet";
			} else if (/mac|windows|linux/i.test(ua)) {
				icon = Laptop;
				deviceType = "Desktop";
			}

			if (/chrome/i.test(ua) && !/edg/i.test(ua)) browser = "Chrome";
			else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";
			else if (/firefox/i.test(ua)) browser = "Firefox";
			else if (/edg/i.test(ua)) browser = "Edge";

			if (/mac/i.test(ua)) os = "macOS";
			else if (/windows/i.test(ua)) os = "Windows";
			else if (/linux/i.test(ua)) os = "Linux";
			else if (/android/i.test(ua)) os = "Android";
			else if (/ios|iphone|ipad/i.test(ua)) os = "iOS";

			const name = `${deviceType} • ${browser}`;
			return { name, icon, os, browser };
		},
		[],
	);

	const formatLastSeen = React.useCallback((value: string | Date) => {
		const date = new Date(value);
		return new Intl.DateTimeFormat("en-US", {
			dateStyle: "short",
			timeStyle: "short",
		}).format(date);
	}, []);

	if (sessionLoading) {
		return (
			<SettingsLayout
				title="User Account"
				description="Manage your account settings and active sessions."
			>
				<div className="flex items-center justify-center p-8">
					<div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
				</div>
			</SettingsLayout>
		);
	}

	if (!user) {
		return (
			<SettingsLayout
				title="User Account"
				description="Manage your account settings and active sessions."
			>
				<p className="text-sm text-muted-foreground">
					Sign in to manage your profile.
				</p>
			</SettingsLayout>
		);
	}

	const currentSessionId = sessionData?.session?.id;

	return (
		<SettingsLayout
			title="User Account"
			description="Manage your account settings and active sessions."
		>
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>Profile Information</CardTitle>
						<CardDescription>Your personal account information</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="flex items-center space-x-4">
							<Avatar className="h-20 w-20">
								<AvatarImage src={user?.image || ""} />
								<AvatarFallback className="text-lg">
									{displayName ? displayName.charAt(0).toUpperCase() : "?"}
								</AvatarFallback>
							</Avatar>
						</div>

						<div className="grid gap-4">
							<div className="space-y-2">
								<Label
									htmlFor="name"
									className="text-sm font-medium text-muted-foreground"
								>
									Name
								</Label>
								{isEditingName ? (
									<div className="flex flex-col gap-2 sm:flex-row">
										<Input
											id="name"
											value={nameValue}
											onChange={(e) => setNameValue(e.target.value)}
											placeholder="Enter your name"
											className="flex-1"
											disabled={isAuthBusy}
										/>
										<div className="flex gap-2">
											<Button
												onClick={handleSaveName}
												disabled={isAuthBusy}
												size="sm"
												className="flex-1 sm:flex-none"
											>
												<Save className="h-4 w-4" />
												{updateUser.isPending ? "Saving..." : "Save"}
											</Button>
											<Button
												onClick={handleCancelEdit}
												variant="outline"
												size="sm"
												className="flex-1 sm:flex-none"
												disabled={isAuthBusy}
											>
												<X className="h-4 w-4" />
												Cancel
											</Button>
										</div>
									</div>
								) : (
									<div className="flex items-center justify-between">
										<div
											className={cn(
												"text-sm",
												!displayName && "italic text-muted-foreground",
											)}
										>
											{displayName || "No name"}
										</div>
										<Button
											onClick={handleEditName}
											variant="ghost"
											size="sm"
											disabled={isAuthBusy}
										>
											<Edit className="h-4 w-4" />
											Edit
										</Button>
									</div>
								)}
							</div>

							<div className="space-y-2">
								<Label className="text-sm font-medium text-muted-foreground">
									Email
								</Label>
								<div className="text-sm">{user?.email}</div>
							</div>

							<div className="space-y-2">
								<Label className="text-sm font-medium text-muted-foreground">
									User ID
								</Label>
								<div className="font-mono text-xs text-muted-foreground">
									{user?.id}
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Active Sessions</CardTitle>
						<CardDescription>
							Manage your active login sessions across devices
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{sessionsLoading ? (
							<div className="flex items-center justify-center p-4">
								<div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
							</div>
						) : (
							<>
								<div className="space-y-3">
									{sessions.map(
										(sessionItem: {
											id: string;
											userAgent?: string | null;
											createdAt: string | Date;
											ipAddress?: string | null;
											token?: string;
										}) => {
											const deviceInfo = getDeviceInfo(sessionItem.userAgent);
											const DeviceIcon = deviceInfo.icon;
											const isCurrentSession =
												sessionItem.id === currentSessionId ||
												sessionItem.id === currentSessionId;

											return (
												<div
													key={sessionItem.id}
													className={cn(
														"flex flex-col justify-between gap-3 rounded-lg border p-3 sm:flex-row sm:items-center",
														isCurrentSession
															? "border-primary bg-primary/5"
															: "border-border",
													)}
												>
													<div className="flex flex-1 items-start gap-3">
														<div className="mt-0.5">
															<DeviceIcon className="h-5 w-5 text-muted-foreground" />
														</div>
														<div className="flex-1 space-y-1">
															<div className="flex flex-wrap items-center gap-2">
																<span className="text-sm font-medium">
																	{deviceInfo.name}
																</span>
																{isCurrentSession && (
																	<span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
																		Current
																	</span>
																)}
															</div>
															<div className="text-xs text-muted-foreground">
																Last seen:{" "}
																{formatLastSeen(sessionItem.createdAt)}
															</div>
															{sessionItem.ipAddress && (
																<div className="text-xs text-muted-foreground">
																	IP: {sessionItem.ipAddress}
																</div>
															)}
														</div>
													</div>
													<div className="flex-shrink-0">
														{isCurrentSession ? (
															<Button
																onClick={handleSignOut}
																variant="destructive"
																size="sm"
																className="w-full sm:w-auto"
																disabled={isAuthBusy}
															>
																<LogOut className="h-4 w-4" />
																Sign Out
															</Button>
														) : (
															<Button
																onClick={() =>
																	void handleRevokeSession(sessionItem.id)
																}
																variant="destructive"
																size="sm"
																disabled={isAuthBusy}
																className="w-full sm:w-auto"
															>
																<UserX className="h-4 w-4" />
																Revoke
															</Button>
														)}
													</div>
												</div>
											);
										},
									)}
								</div>

								{sessions.length > 1 && (
									<>
										<Separator />
										<div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
											<div>
												<div className="text-sm font-medium">
													Security Action
												</div>
												<div className="text-xs text-muted-foreground">
													Sign out of all other devices
												</div>
											</div>
											<Button
												onClick={() => void handleRevokeOtherSessions()}
												variant="destructive"
												size="sm"
												disabled={isAuthBusy}
												className="w-full sm:w-auto"
											>
												<UserX className="h-4 w-4" />
												{revokeOtherSessions.isPending
													? "Revoking..."
													: "Revoke All Other Sessions"}
											</Button>
										</div>
									</>
								)}
							</>
						)}
					</CardContent>
				</Card>
			</div>
		</SettingsLayout>
	);
}
