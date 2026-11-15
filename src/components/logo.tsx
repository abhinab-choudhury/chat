import { cn } from "#/lib/utils";

/**
 * App branding.
 *
 * `logo.png` is the 100px mark; the favicon/apple-touch variants live next to
 * it in `public/` and are wired up in the root route head.
 */

interface LogoSymbolProps {
	className?: string;
}

/** The mark on its own, for tight spaces and favicons. */
export function LogoSymbol({ className }: LogoSymbolProps) {
	return (
		<img
			src="/logo.png"
			alt=""
			aria-hidden="true"
			draggable={false}
			width={100}
			height={100}
			className={cn(
				"size-7 shrink-0 rounded-md object-contain select-none",
				className,
			)}
		/>
	);
}

interface LogoProps {
	className?: string;
	showWordmark?: boolean;
}

/** Mark plus wordmark, for headers. */
export function Logo({ className, showWordmark = true }: LogoProps) {
	return (
		<span className={cn("inline-flex items-center gap-2", className)}>
			<LogoSymbol />
			{showWordmark ? (
				<span className="text-2xl font-bold tracking-tight">.Chat</span>
			) : null}
		</span>
	);
}
