import { ChevronDown, ExternalLink, Globe, Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "#/lib/utils";
import type { WebSearchToolCall } from "#/lib/search/types";

function getFaviconUrl(url: string): string {
	try {
		const domain = new URL(url).hostname;
		return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
	} catch {
		return "";
	}
}

function getScreenshotUrl(url: string): string {
	try {
		return `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`;
	} catch {
		return "";
	}
}

const Favicon = React.memo(function Favicon({ url }: { url: string }) {
	const [loaded, setLoaded] = React.useState(false);
	return (
		<div className="relative flex size-4 items-center justify-center rounded-full">
			{!loaded && (
				<div className="absolute inset-0 animate-pulse bg-muted-foreground/10" />
			)}
			<img
				src={getFaviconUrl(url)}
				alt=""
				className={cn(
					"size-4 rounded-full object-contain",
					!loaded && "opacity-0",
				)}
				onLoad={() => setLoaded(true)}
				onError={(e) => {
					setLoaded(true);
					const target = e.target as HTMLImageElement;
					target.src =
						"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cline x1='12' y1='8' x2='12' y2='16'/%3E%3Cline x1='8' y1='12' x2='16' y2='12'/%3E%3C/svg%3E";
				}}
			/>
		</div>
	);
});

/**
 * Collapsible web-search call strip: spinner/globe header with the query and
 * result count, and an expandable horizontal carousel of result cards
 * (favicon, screenshot, title, description, domain). Ported from
 * intern3-chat's WebSearchToolRenderer.
 */
export function WebSearchResults({ call }: { call: WebSearchToolCall }) {
	const [expanded, setExpanded] = React.useState(false);

	const isLoading = call.state === "loading";
	const results = call.results ?? [];
	const hasResults = call.state === "done" && results.length > 0;

	return (
		<div className="w-full">
			<button
				type="button"
				className="flex w-full cursor-pointer flex-col gap-2 text-left md:flex-row md:items-center"
				onClick={() => hasResults && setExpanded((v) => !v)}
				disabled={isLoading}
				aria-expanded={expanded}
			>
				<div className="flex flex-1 items-center gap-2">
					{isLoading ? (
						<Loader2 className="size-4 animate-spin text-primary" />
					) : (
						<Globe className="size-4 text-primary" />
					)}
					<span className="font-medium text-primary">Web Search</span>
					{call.error ? (
						<span className="text-muted-foreground text-xs">
							{call.error}
						</span>
					) : null}
					<div className="flex-1 md:hidden" />
					{hasResults && (
						<div
							className={cn(
								"transform transition-transform md:hidden",
								expanded && "rotate-180",
							)}
						>
							<ChevronDown className="size-4 text-foreground" />
						</div>
					)}
				</div>

				{call.query || hasResults ? (
					<div className="flex items-center gap-2 md:ml-auto">
						<div className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1 text-sm text-muted-foreground">
							{call.query ? (
								<span className="max-w-32 truncate md:max-w-48">
									"{call.query}"
								</span>
							) : null}
							{hasResults ? (
								<span className="flex items-center gap-2 truncate">
									<div className="size-1 rounded-full bg-primary" />
									<span className="truncate">{results.length} results</span>
								</span>
							) : null}
						</div>
						{hasResults && (
							<div
								className={cn(
									"hidden transform transition-transform md:block",
									expanded && "rotate-180",
								)}
							>
								<ChevronDown className="size-4 text-foreground" />
							</div>
						)}
					</div>
				) : null}
			</button>

			{expanded && hasResults ? (
				<div className="my-4 overflow-hidden rounded-lg border bg-muted/50">
					<div className="flex gap-4 overflow-x-auto p-4">
						{results.map((result, index) => (
							<button
								key={`${result.url}-${index}`}
								type="button"
								className={cn(
									"group relative flex-shrink-0 overflow-hidden rounded-lg border bg-card text-left",
									"transition-all duration-200 hover:border-primary/20 hover:bg-accent/50 hover:shadow-lg",
									"w-64 min-w-64",
								)}
								onClick={() =>
									result.url && window.open(result.url, "_blank")
								}
								aria-label={`Open ${result.title} in new tab`}
							>
								{result.url ? (
									<div className="relative h-32 overflow-hidden bg-muted/30">
										<img
											src={getScreenshotUrl(result.url)}
											alt=""
											className="aspect-video h-full w-full object-cover"
											onError={(e) => {
												const target = e.target as HTMLImageElement;
												target.style.display = "none";
											}}
										/>
									</div>
								) : null}
								<div className="space-y-2 p-4">
									<div className="flex items-center gap-2">
										{result.url ? <Favicon url={result.url} /> : null}
										<h3 className="m-0 mb-0 truncate font-semibold text-base text-foreground leading-tight">
											{result.title}
										</h3>
									</div>
									<p className="line-clamp-3 text-muted-foreground text-sm leading-relaxed">
										{result.description}
									</p>
									{result.url ? (
										<div className="flex items-center gap-1.5 border-border/50 border-t pt-2">
											<span className="flex-1 truncate text-muted-foreground/70 text-xs">
												{result.url
													.replace(/^(https?:\/\/)/, "")
													.split("/")[0]}
											</span>
											<ExternalLink className="size-3 flex-shrink-0 text-muted-foreground/50" />
										</div>
									) : null}
								</div>
							</button>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}
