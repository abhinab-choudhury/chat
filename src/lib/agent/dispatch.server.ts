import type { z } from "zod";
import { auth } from "../auth";
import { getDecryptedUserSettings } from "../user-settings.server";
import { signEnvelope } from "./bridge";
import type { chatInput } from "./core";
import { ChatTransportError } from "./transport";

export type ChatRequest = z.infer<typeof chatInput>;

/** Resolve the authenticated user's credentials and open the signed Convex request. */
export async function openAgentStream(
	request: Request,
	body: ChatRequest,
): Promise<ReadableStream<Uint8Array>> {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user.id) throw new ChatTransportError("Please sign in again.");
	const secrets = await getDecryptedUserSettings(session.user.id);
	if (!secrets.geminiKey)
		throw new ChatTransportError(
			"Add your Gemini key in Settings → AI Provider.",
		);
	const site = process.env.VITE_CONVEX_SITE_URL;
	const secret = process.env.AGENT_BRIDGE_SECRET;
	if (!site || !secret)
		throw new ChatTransportError("The Convex agent bridge is not configured.");
	const question = [...body.messages]
		.reverse()
		.find((message) => message.role === "user")?.content;
	if (!question) throw new ChatTransportError("A user question is required.");
	const payload = JSON.stringify({
		expiresAt: Date.now() + 60000,
		userId: session.user.id,
		threadId: body.threadId,
		requestId: body.streamId,
		question,
		timezone: body.timezone,
		model: body.model || "gemini-3.5-flash-lite",
		memory: body.memory ?? true,
		reasoningEffort: body.reasoningEffort ?? "medium",
		geminiKey: secrets.geminiKey,
		search:
			body.webSearch && secrets.search
				? { provider: secrets.search.provider, apiKey: secrets.search.apiKey }
				: null,
	});
	const response = await fetch(`${site.replace(/\/$/, "")}/agent/chat`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Agent-Signature": await signEnvelope(payload, secret),
		},
		body: payload,
		signal: AbortSignal.timeout(140000),
	});
	if (!response.ok || !response.body)
		throw new ChatTransportError(
			"The Convex agent is unavailable. Please retry.",
		);
	return response.body;
}
