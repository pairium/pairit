/**
 * SSE Stream routes for lab server
 * GET /sessions/:id/stream - Server-sent events stream
 */

import { Elysia, sse, t } from "elysia";
import { handleDisconnect } from "../lib/matchmaking-pool";
import {
	AsyncEventQueue,
	addConnection,
	broadcastToSession,
	removeConnection,
	type SSEController,
} from "../lib/sse";
import { loadSession } from "./sessions";

const HEARTBEAT_INTERVAL = 15000; // 15 seconds — keeps idle proxies from closing the stream

// Cloud Run's proxy keeps the upstream request open after the browser
// disconnects, so the server never sees the client leave. End every stream
// after this long; EventSource reconnects within seconds. Without a cap,
// abandoned streams hold a concurrency slot until the request timeout.
const MAX_STREAM_DURATION = 5 * 60 * 1000;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export const streamRoutes = new Elysia({ prefix: "/sessions" })
	.get(
		"/:id/stream",
		async function* ({ params: { id }, set, request }) {
			// Verify session exists
			const session = await loadSession(id);
			if (!session) {
				set.status = 404;
				return;
			}

			// Create event queue for this connection
			const queue = new AsyncEventQueue();

			// Create controller for this connection
			const controller: SSEController = {
				send: (event, data) => {
					queue.push({ event, data });
				},
				close: () => {
					queue.close();
				},
			};

			addConnection(id, controller);

			const maxDurationTimer = setTimeout(
				() => queue.close(),
				MAX_STREAM_DURATION,
			);
			const onAbort = () => queue.close();
			request.signal.addEventListener("abort", onAbort);

			try {
				// Send initial connected event
				yield sse({ event: "connected", data: { sessionId: id } });

				// Start heartbeat in background
				let heartbeatActive = true;
				const heartbeatLoop = async () => {
					while (heartbeatActive && !queue.isClosed()) {
						await sleep(HEARTBEAT_INTERVAL);
						if (heartbeatActive && !queue.isClosed()) {
							queue.push({ event: "heartbeat", data: { ts: Date.now() } });
						}
					}
				};
				heartbeatLoop(); // Fire and forget

				// Yield events from queue
				while (!queue.isClosed()) {
					const evt = await queue.pop();
					if (evt === null || evt.event === "__closed__") break;
					yield sse(evt);
				}

				heartbeatActive = false;
			} finally {
				clearTimeout(maxDurationTimer);
				request.signal.removeEventListener("abort", onAbort);
				removeConnection(id, controller);
				handleDisconnect(id);
			}
		},
		{
			params: t.Object({ id: t.String() }),
		},
	)
	// Test endpoint for verifying broadcast functionality (development only)
	.get(
		"/:id/test-broadcast",
		async ({ params: { id }, set }) => {
			if (process.env.NODE_ENV !== "development") {
				set.status = 404;
				return { error: "not_found" };
			}

			const session = await loadSession(id);
			if (!session) {
				set.status = 404;
				return { error: "not_found" };
			}

			broadcastToSession(id, "test", {
				message: "hello from test-broadcast",
				ts: Date.now(),
			});
			return { sent: true };
		},
		{
			params: t.Object({ id: t.String() }),
		},
	);
