import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";

async function main() {
	if (import.meta.env.DEV) {
		await import("react-devtools-cdt-mcp/register");
	}

	const { hydrateRoot } = await import("react-dom/client");

	startTransition(() => {
		hydrateRoot(
			document,
			<StrictMode>
				<StartClient />
			</StrictMode>,
		);
	});
}

void main();
