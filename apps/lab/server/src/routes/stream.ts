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

const HEARTBEAT_INTERVAL = 30000; // 30 seconds

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export const streamRoutes = new Elysia({ prefix: "/sessions" })
	.get(
		"/:id/stream",
		async function* ({ params: { id }, set }) {
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
