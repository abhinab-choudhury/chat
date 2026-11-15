import { Flame } from "lucide-react";

import { BraveIcon, SerperDevIcon, TavilyIcon } from "#/components/brand-icons";
import type { SearchProviderType } from "#/lib/search/types";

export function SearchProviderIcon({
	provider,
	className,
}: {
	provider: SearchProviderType;
	className?: string;
}) {
	switch (provider) {
		case "brave":
			return <BraveIcon className={className} />;
		case "tavily":
			return <TavilyIcon className={className} />;
		case "serper":
			return <SerperDevIcon className={className} />;
		default:
			return <Flame className={className} />;
	}
}
