/** Only explicitly public errors are sent to the browser. */
export class ChatTransportError extends Error {}

export type ResumeStream = (
	stream: ReadableStream<string>,
) => Promise<ReadableStream<string> | null>;

const preparingEvent = `${JSON.stringify({ t: "status", d: "preparing" })}\n`;

/** Forward progress immediately while continuing server work if a tab disconnects. */
export function createChatResponseStream(
	openUpstream: () => Promise<ReadableStream<Uint8Array>>,
	resume?: ResumeStream,
): ReadableStream<Uint8Array> {
	const producer = new ReadableStream<string>({
		async start(controller) {
			controller.enqueue(preparingEvent);
			try {
				const reader = (await openUpstream()).getReader();
				const decoder = new TextDecoder();
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						controller.enqueue(decoder.decode(value, { stream: true }));
					}
					controller.enqueue(decoder.decode());
				} finally {
					reader.releaseLock();
				}
			} catch (error) {
				const message =
					error instanceof ChatTransportError
						? error.message
						: "Unable to complete the response. Please retry.";
				controller.enqueue(`${JSON.stringify({ t: "err", d: message })}\n`);
			} finally {
				controller.close();
			}
		},
	});
	const [client, background] = producer.tee();
	void drain(background);

	let reader: ReadableStreamDefaultReader<string> | undefined;
	let cancelled = false;
	const output = new ReadableStream<string>({
		async start(controller) {
			// Flush before waiting for Redis registration, authentication or model work.
			controller.enqueue(preparingEvent);
			const registered = resume ? await resume(client).catch(() => null) : null;
			reader = (registered ?? client).getReader();
			try {
				if (cancelled) {
					void reader.cancel().catch(() => {});
					return;
				}
				while (true) {
					const { done, value } = await reader.read();
					if (done || cancelled) break;
					controller.enqueue(value);
				}
				if (!cancelled) controller.close();
			} catch (error) {
				if (!cancelled) controller.error(error);
			} finally {
				reader.releaseLock();
			}
		},
		cancel() {
			cancelled = true;
			// A tee branch's cancellation can wait for the other branch to finish.
			// Do not block client cleanup on background persistence.
			void reader?.cancel().catch(() => {});
		},
	});
	return output.pipeThrough(new TextEncoderStream());
}

async function drain(stream: ReadableStream<string>): Promise<void> {
	const reader = stream.getReader();
	try {
		while (!(await reader.read()).done) {
			/* Keep the producer alive. */
		}
	} catch {
		/* The producer reports errors through its event stream. */
	} finally {
		reader.releaseLock();
	}
}
