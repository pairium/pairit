/**
 * SSE Connection Manager
 * Manages server-sent event connections and broadcasts
 */

import { getSessionsCollection } from "./db";

export type SSEEvent = {
	event: string;
	data: unknown;
};

export type SSEController = {
	send: (event: string, data: unknown) => void;
	close: () => void;
};

/**
 * Simple async queue for SSE events
 * Allows pushing events that can be consumed by an async iterator
 */
export class AsyncEventQueue {
	private queue: SSEEvent[] = [];
	private resolvers: ((value: SSEEvent) => void)[] = [];
	private closed = false;

	push(event: SSEEvent): void {
		if (this.closed) return;

		const resolver = this.resolvers.shift();
		if (resolver) {
			resolver(event);
		} else {
			this.queue.push(event);
		}
	}

	async pop(): Promise<SSEEvent | null> {
		if (this.closed && this.queue.length === 0) return null;

		const queued = this.queue.shift();
		if (queued) {
			return queued;
		}

		if (this.closed) return null;

		return new Promise((resolve) => {
			this.resolvers.push(resolve);
		});
	}

	close(): void {
		this.closed = true;
		// Resolve any pending waiters with null
		for (const resolver of this.resolvers) {
			resolver({ event: "__closed__", data: null });
		}
		this.resolvers = [];
	}

	isClosed(): boolean {
		return this.closed;
	}
}

// Map<sessionId, Set<SSEController>> - multiple tabs = multiple controllers
const connections = new Map<string, Set<SSEController>>();

export function addConnection(
	sessionId: string,
	controller: SSEController,
): void {
	let sessionConnections = connections.get(sessionId);
	if (!sessionConnections) {
		sessionConnections = new Set();
		connections.set(sessionId, sessionConnections);
	}
	sessionConnections.add(controller);
	console.log(
		`[SSE] Connection added for session ${sessionId} (total: ${sessionConnections.size})`,
	);
}

export function removeConnection(
	sessionId: string,
	controller: SSEController,
): void {
	const sessionConnections = connections.get(sessionId);
	if (sessionConnections) {
		sessionConnections.delete(controller);
		console.log(
			`[SSE] Connection removed for session ${sessionId} (remaining: ${sessionConnections.size})`,
		);
		if (sessionConnections.size === 0) {
			connections.delete(sessionId);
		}
	}
}

export function broadcastToSession(
	sessionId: string,
	event: string,
	data: unknown,
): void {
	const sessionConnections = connections.get(sessionId);
	if (!sessionConnections) {
		console.log(`[SSE] No connections for session ${sessionId}`);
		return;
	}

	console.log(
		`[SSE] Broadcasting '${event}' to ${sessionConnections.size} connection(s) for session ${sessionId}`,
	);
	for (const controller of sessionConnections) {
		controller.send(event, data);
	}
}

export async function broadcastToGroup(
	groupId: string,
	event: string,
	data: unknown,
): Promise<void> {
	// Look up sessions by group_id in MongoDB
	const collection = await getSessionsCollection();
	const sessions = await collection
		.find({ "user_state.group_id": groupId })
		.project({ id: 1 })
		.toArray();

	console.log(
		`[SSE] Broadcasting '${event}' to group ${groupId} (${sessions.length} sessions)`,
	);
	for (const session of sessions) {
		broadcastToSession(session.id, event, data);
	}
}

export function getConnectionCount(sessionId: string): number {
	return connections.get(sessionId)?.size ?? 0;
}

export function getTotalConnectionCount(): number {
	let total = 0;
	for (const sessionConnections of connections.values()) {
		total += sessionConnections.size;
	}
	return total;
}
