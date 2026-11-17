import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "#/components/ui/button";

export const Route = createFileRoute("/_chat/library")({
	component: MemoryLibrary,
});
interface Episode {
	id: string;
	threadId: string;
	question: string;
	questionAt: number;
	archived: boolean;
	indexed: boolean;
	indexState: string | null;
}
interface Fact {
	id: string;
	episodeId: string;
	content: string;
	quote: string;
	supersededBy: string | null;
}
function MemoryLibrary() {
	const [data, setData] = useState<{ episodes: Episode[]; facts: Fact[] }>({
		episodes: [],
		facts: [],
	});
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const load = useCallback(async () => {
		const response = await fetch("/api/chats?view=memories");
		if (!response.ok) throw new Error("Unable to load memories");
		setData(await response.json());
	}, []);
	useEffect(() => {
		void load().catch((e) => setError(e.message));
	}, [load]);
	const mutate = async (
		episode: Episode,
		op: "archiveMemory" | "forgetMemory",
	) => {
		setBusy(true);
		setError("");
		try {
			const response = await fetch("/api/chats", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					op,
					episodeId: episode.id,
					archived: !episode.archived,
				}),
			});
			if (!response.ok) throw new Error("Unable to update memory");
			await load();
		} catch {
			setError("Unable to update memory");
		} finally {
			setBusy(false);
		}
	};
	return (
		<main className="mx-auto w-full max-w-3xl overflow-auto p-6">
			<h1 className="mb-2 text-xl font-semibold">Memory</h1>
			<p className="mb-6 text-sm text-muted-foreground">
				Your latest 100 source-linked conversations. Archive hides a memory;
				forget removes its projection while keeping chat history. Edit the
				source message to correct a fact.
			</p>
			{error && <p role="alert">{error}</p>}
			{!data.episodes.length && (
				<p>No memories yet. Enable memory and complete a conversation.</p>
			)}
			{data.episodes.map((episode) => (
				<article key={episode.id} className="mb-4 rounded-xl border p-4">
					<div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
						<time>{new Date(episode.questionAt).toLocaleString()}</time>
						<span>
							{episode.archived ? "Archived" : "Active"} ·{" "}
							{episode.indexed
								? "Indexed"
								: episode.indexState === "failed"
									? "Index failed"
									: "Index pending"}
						</span>
					</div>
					<p className="whitespace-pre-wrap">{episode.question}</p>
					{data.facts
						.filter((f) => f.episodeId === episode.id)
						.map((f) => (
							<blockquote key={f.id} className="mt-3 border-l-2 pl-3 text-sm">
								<p>
									{f.content}
									{f.supersededBy ? " (superseded)" : ""}
								</p>
								<q className="text-muted-foreground">{f.quote}</q>
							</blockquote>
						))}
					<div className="mt-3 flex gap-3">
						<Link
							to="/thread/$threadId"
							params={{ threadId: episode.threadId }}
							className="text-sm underline"
						>
							View source
						</Link>
						<Button
							size="xs"
							variant="ghost"
							disabled={busy}
							onClick={() => void mutate(episode, "archiveMemory")}
						>
							{episode.archived ? "Unarchive" : "Archive"}
						</Button>
						<Button
							size="xs"
							variant="ghost"
							disabled={busy}
							onClick={() => void mutate(episode, "forgetMemory")}
						>
							Forget
						</Button>
					</div>
				</article>
			))}
		</main>
	);
}
