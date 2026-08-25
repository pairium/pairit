type EventListener = (data: unknown) => void;

export type SSEClientOptions = {
	baseUrl: string;
	withCredentials?: boolean;
};

export class SSEClient {
	private eventSource: EventSource | null = null;
	private sessionId: string | null = null;
	private listeners: Map<string, Set<EventListener>> = new Map();
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectDelay = 1000;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private baseUrl: string;
	private withCredentials: boolean;

	constructor(options: SSEClientOptions) {
		this.baseUrl = options.baseUrl;
		this.withCredentials = options.withCredentials ?? true;
	}

	connect(sessionId: string): void {
		if (
			this.sessionId === sessionId &&
			this.eventSource?.readyState === EventSource.OPEN
		) {
			return;
		}

		this.disconnect();

		this.sessionId = sessionId;
		this.reconnectAttempts = 0;

		this.createConnection();
	}

	private createConnection(): void {
		if (!this.sessionId) return;

		const url = `${this.baseUrl}/sessions/${this.sessionId}/stream`;

		console.log(`[SSE] Connecting to ${url}`);

		this.eventSource = new EventSource(url, {
			withCredentials: this.withCredentials,
		});

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

		const events = [
			"connected",
			"heartbeat",
			"chat_message",
			"chat_ended",
			"state_updated",
			"chat_message_delta",
			"match_found",
			"match_timeout",
			"workspace_updated",
			"chat_stream_end",
		] as const;
		for (const type of events) {
			this.eventSource.addEventListener(type, (event) => {
				this.dispatchEvent(type, JSON.parse(event.data));
			});
		}
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

	on(event: string, listener: EventListener): () => void {
		let eventListeners = this.listeners.get(event);
		if (!eventListeners) {
			eventListeners = new Set();
			this.listeners.set(event, eventListeners);
		}
		eventListeners.add(listener);

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

	isConnected(): boolean {
		return this.eventSource?.readyState === 1;
	}

	getSessionId(): string | null {
		return this.sessionId;
	}
}
