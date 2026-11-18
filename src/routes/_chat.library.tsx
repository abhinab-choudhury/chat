import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import type { shortTermWindow } from "#/lib/memory/short-term";

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
interface ShortTerm {
	id: string;
	title: string;
	entries: ReturnType<typeof shortTermWindow>;
}
interface Fact {
	key: string;
	id: string;
	episodeId: string;
	content: string;
	quote: string;
	supersededBy: string | null;
}
function MemoryLibrary() {
	const [data, setData] = useState<{
		episodes: Episode[];
		facts: Fact[];
		shortTerm: ShortTerm[];
	}>({
		shortTerm: [],
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
				Inspect recent conversation context, saved facts, and source-linked
				episodes. Archive hides an episode; forget removes its projection while
				keeping chat history. Edit the source message to correct a fact.
			</p>
			{error && <p role="alert">{error}</p>}
			<Tabs defaultValue="short-term">
				<TabsList className="w-full" aria-label="Memory types">
					<TabsTrigger value="short-term">Short-term</TabsTrigger>
					<TabsTrigger value="long-term">Long-term facts</TabsTrigger>
					<TabsTrigger value="episodes">Episodes</TabsTrigger>
				</TabsList>
				<TabsContent value="short-term">
					<p className="my-4 text-sm text-muted-foreground">
						A sliding window of up to 20 messages and 24,000 characters per
						conversation. The latest four prior messages and older matching
						entries are supplied for each request. Showing the latest 20 active
						conversations.
					</p>
					{!data.shortTerm.length && <p>No conversation context yet.</p>}
					{data.shortTerm.map((thread) => (
						<article key={thread.id} className="mb-4 rounded-xl border p-4">
							<Link
								to="/thread/$threadId"
								params={{ threadId: thread.id }}
								className="font-medium underline"
							>
								{thread.title}
							</Link>
							<dl className="mt-3 space-y-3">
								{Object.entries(thread.entries).map(([key, entry]) => (
									<div key={key}>
										<dt className="break-all font-mono text-xs text-muted-foreground">
											{key} · {entry.role}
										</dt>
										<dd className="mt-1 whitespace-pre-wrap text-sm">
											{entry.value}
										</dd>
									</div>
								))}
							</dl>
						</article>
					))}
				</TabsContent>
				<TabsContent value="long-term">
					<p className="my-4 text-sm text-muted-foreground">
						Saved user assertions and preferences. Newer values supersede older
						values with the same key.
					</p>
					{!data.facts.some(
						(fact) =>
							!fact.supersededBy &&
							data.episodes.some(
								(episode) => episode.id === fact.episodeId && !episode.archived,
							),
					) && <p>No active saved facts yet.</p>}
					{data.facts
						.filter(
							(fact) =>
								!fact.supersededBy &&
								data.episodes.some(
									(episode) =>
										episode.id === fact.episodeId && !episode.archived,
								),
						)
						.map((fact) => (
							<article key={fact.id} className="mb-4 rounded-xl border p-4">
								<p className="font-mono text-xs text-muted-foreground">
									{fact.key}
								</p>
								<p className="mt-2">{fact.content}</p>
								<q className="text-sm text-muted-foreground">{fact.quote}</q>
							</article>
						))}
				</TabsContent>
				<TabsContent value="episodes">
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
									<blockquote
										key={f.id}
										className="mt-3 border-l-2 pl-3 text-sm"
									>
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
				</TabsContent>
			</Tabs>
		</main>
	);
}
