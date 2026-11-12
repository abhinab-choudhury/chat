import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { GithubIcon, GoogleIcon, TwitterIcon } from "#/components/brand-icons";
import { ThemeToggle } from "#/components/theme-toggle";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "#/components/ui/input-otp";
import { Label } from "#/components/ui/label";
import { Separator } from "#/components/ui/separator";
import { Spinner } from "#/components/ui/spinner";
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/login")({
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	const [email, setEmail] = React.useState("");
	const [otp, setOtp] = React.useState("");
	const [step, setStep] = React.useState<"email" | "otp">("email");
	const [loading, setLoading] = React.useState(false);
	const [pendingProvider, setPendingProvider] = React.useState<
		"google" | "github" | "twitter" | null
	>(null);
	const [error, setError] = React.useState<string | null>(null);

	const isBusy = loading || pendingProvider !== null;

	const sendOtp = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setLoading(true);
		try {
			const { error } = await authClient.emailOtp.sendVerificationOtp({
				email,
				type: "sign-in",
			});
			if (error) {
				setError(error.message ?? "Failed to send OTP");
				return;
			}
			setStep("otp");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to send OTP");
		} finally {
			setLoading(false);
		}
	};

	const verifyOtp = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setLoading(true);
		try {
			const { error } = await authClient.signIn.emailOtp({
				email,
				otp,
			});
			if (error) {
				setError(error.message ?? "Invalid OTP");
				return;
			}
			void navigate({ to: "/" });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Invalid OTP");
		} finally {
			setLoading(false);
		}
	};

	const socialSignIn = async (provider: "google" | "github" | "twitter") => {
		setError(null);
		setPendingProvider(provider);
		setLoading(true);
		try {
			const { error } = await authClient.signIn.social({ provider });
			if (error) {
				setError(error.message ?? `Failed to sign in with ${provider}`);
			}
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: `Failed to sign in with ${provider}`,
			);
		} finally {
			setLoading(false);
			setPendingProvider(null);
		}
	};

	return (
		<div className="relative flex min-h-screen items-center justify-center p-4">
			<div className="absolute right-4 top-4">
				<ThemeToggle />
			</div>
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>Sign in</CardTitle>
					<CardDescription>Choose a method to continue</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-2">
						<Button
							variant="outline"
							onClick={() => void socialSignIn("google")}
							disabled={isBusy}
						>
							<GoogleIcon data-icon="inline-start" />
							{pendingProvider === "google"
								? "Connecting..."
								: "Continue with Google"}
						</Button>
						<Button
							variant="outline"
							onClick={() => void socialSignIn("github")}
							disabled={isBusy}
						>
							<GithubIcon data-icon="inline-start" />
							{pendingProvider === "github"
								? "Connecting..."
								: "Continue with GitHub"}
						</Button>
						<Button
							variant="outline"
							onClick={() => void socialSignIn("twitter")}
							disabled={isBusy}
						>
							<TwitterIcon className="inline-start" />
							{pendingProvider === "twitter"
								? "Connecting..."
								: "Continue with Twitter (X)"}
						</Button>
					</div>

					<div className="flex items-center gap-2">
						<Separator className="flex-1" />
						<span className="text-xs text-muted-foreground">OR</span>
						<Separator className="flex-1" />
					</div>

					<div className="min-h-[8.5rem]">
						{step === "email" ? (
							<form onSubmit={(e) => void sendOtp(e)} className="space-y-3">
								<div className="space-y-2">
									<Label htmlFor="email">Email</Label>
									<Input
										id="email"
										type="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										required
										placeholder="you@example.com"
										disabled={isBusy}
									/>
								</div>
								<Button type="submit" className="w-full" disabled={isBusy}>
									{loading && !pendingProvider ? (
										<Spinner />
									) : (
										"Continue with email"
									)}
								</Button>
							</form>
						) : (
							<form onSubmit={(e) => void verifyOtp(e)} className="space-y-3">
								<div className="items-center space-y-2">
									<div className="flex items-center justify-between gap-2">
										<Label htmlFor="otp">One-time code</Label>
										<Button
											type="button"
											variant="link"
											className="h-auto p-0 text-sm"
											onClick={() => setStep("email")}
											disabled={isBusy}
										>
											Use a different email
										</Button>
									</div>
									<InputOTP
										id="otp"
										maxLength={6}
										value={otp}
										onChange={setOtp}
									>
										<InputOTPGroup>
											{Array.from({ length: 6 }).map((_, i) => (
												<InputOTPSlot key={i} index={i} />
											))}
										</InputOTPGroup>
									</InputOTP>
								</div>
								<Button
									type="submit"
									className="w-full"
									disabled={isBusy || otp.length < 6}
								>
									{loading && !pendingProvider ? "Verifying..." : "Verify"}
								</Button>
							</form>
						)}
					</div>

					<div className="min-h-5">
						{error ? <p className="text-sm text-destructive">{error}</p> : null}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
