/**
 * SSE Client Singleton
 * Manages server-sent events connection for real-time updates
 */

type EventListener = (data: unknown) => void;

class SSEClient {
	private eventSource: EventSource | null = null;
	private sessionId: string | null = null;
	private listeners: Map<string, Set<EventListener>> = new Map();
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectDelay = 1000;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	/**
	 * Connect to the SSE stream for a session
	 */
	connect(sessionId: string): void {
		// If already connected to this session, skip
		if (
			this.sessionId === sessionId &&
			this.eventSource?.readyState === EventSource.OPEN
		) {
			return;
		}

		// Disconnect from any existing connection
		this.disconnect();

		this.sessionId = sessionId;
		this.reconnectAttempts = 0;

		this.createConnection();
	}

	private createConnection(): void {
		if (!this.sessionId) return;

		const baseUrl = import.meta.env.VITE_API_URL || "";
		const url = `${baseUrl}/sessions/${this.sessionId}/stream`;

		console.log(`[SSE] Connecting to ${url}`);

		this.eventSource = new EventSource(url, { withCredentials: true });

		this.eventSource.onopen = () => {
			console.log("[SSE] Connection opened");
			this.reconnectAttempts = 0;
		};

		this.eventSource.onerror = (event) => {
			console.error("[SSE] Connection error", event);

			if (this.eventSource?.readyState === EventSource.CLOSED) {
				this.handleDisconnect();
			}
		};

		// Listen for all known event types
		this.eventSource.addEventListener("connected", (event) => {
			this.dispatchEvent("connected", JSON.parse(event.data));
		});

		this.eventSource.addEventListener("heartbeat", (event) => {
			this.dispatchEvent("heartbeat", JSON.parse(event.data));
		});

		this.eventSource.addEventListener("chat_message", (event) => {
			this.dispatchEvent("chat_message", JSON.parse(event.data));
		});

		this.eventSource.addEventListener("page_change", (event) => {
			this.dispatchEvent("page_change", JSON.parse(event.data));
		});

		this.eventSource.addEventListener("user_state_change", (event) => {
			this.dispatchEvent("user_state_change", JSON.parse(event.data));
		});

		this.eventSource.addEventListener("chat_ended", (event) => {
			this.dispatchEvent("chat_ended", JSON.parse(event.data));
		});

		this.eventSource.addEventListener("state_updated", (event) => {
			this.dispatchEvent("state_updated", JSON.parse(event.data));
		});

		this.eventSource.addEventListener("chat_message_delta", (event) => {
			this.dispatchEvent("chat_message_delta", JSON.parse(event.data));
		});
	}

	private handleDisconnect(): void {
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			console.log("[SSE] Max reconnect attempts reached, giving up");
			return;
		}

		const delay = this.reconnectDelay * 2 ** this.reconnectAttempts;
		this.reconnectAttempts++;

		console.log(
			`[SSE] Attempting reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`,
		);

		this.reconnectTimer = setTimeout(() => {
			this.createConnection();
		}, delay);
	}

	/**
	 * Disconnect from the SSE stream
	 */
	disconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		if (this.eventSource) {
			console.log("[SSE] Disconnecting");
			this.eventSource.close();
			this.eventSource = null;
		}

		this.sessionId = null;
	}

	/**
	 * Subscribe to an event type
	 * @returns Unsubscribe function
	 */
	on(event: string, listener: EventListener): () => void {
		let eventListeners = this.listeners.get(event);
		if (!eventListeners) {
			eventListeners = new Set();
			this.listeners.set(event, eventListeners);
		}
		eventListeners.add(listener);

		// Return unsubscribe function
		return () => {
			eventListeners?.delete(listener);
			if (eventListeners?.size === 0) {
				this.listeners.delete(event);
			}
		};
	}

	private dispatchEvent(event: string, data: unknown): void {
		const eventListeners = this.listeners.get(event);
		if (eventListeners) {
			for (const listener of eventListeners) {
				try {
					listener(data);
				} catch (error) {
					console.error(`[SSE] Error in listener for '${event}':`, error);
				}
			}
		}
	}

	/**
	 * Check if currently connected
	 */
	isConnected(): boolean {
		return this.eventSource?.readyState === EventSource.OPEN;
	}

	/**
	 * Get current session ID
	 */
	getSessionId(): string | null {
		return this.sessionId;
	}
}

// Export singleton instance
export const sseClient = new SSEClient();
