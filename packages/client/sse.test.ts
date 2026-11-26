import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { SSEClient } from "./sse";

const OriginalEventSource = globalThis.EventSource;
const opened: string[] = [];
let lastSource: FakeEventSource | null = null;

class FakeEventSource {
	static readonly OPEN = 1;
	static readonly CLOSED = 2;
	readyState = 0;
	onopen: (() => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;
	listeners = new Map<string, Array<(event: { data: string }) => void>>();
	constructor(url: string) {
		opened.push(url);
		lastSource = this;
	}
	addEventListener(type: string, handler: (event: { data: string }) => void) {
		const list = this.listeners.get(type) ?? [];
		list.push(handler);
		this.listeners.set(type, list);
	}
	emit(type: string, data: unknown) {
		for (const handler of this.listeners.get(type) ?? []) {
			handler({ data: JSON.stringify(data) });
		}
	}
	close() {}
}

afterEach(() => {
	globalThis.EventSource = OriginalEventSource;
	opened.length = 0;
	lastSource = null;
});

describe("SSEClient", () => {
	test("encodes the session id and keeps it out of the console", () => {
		globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
		const log = spyOn(console, "log").mockImplementation(() => {});
		try {
			const client = new SSEClient({ baseUrl: "http://lab.test" });
			client.connect("secret-session/../x");
			client.disconnect();
			expect(opened).toEqual([
				"http://lab.test/sessions/secret-session%2F..%2Fx/stream",
			]);
			const logged = log.mock.calls.flat().join(" ");
			expect(logged).not.toContain("secret-session");
		} finally {
			log.mockRestore();
		}
	});

	test("registers and dispatches timer_expired events from EventSource", () => {
		globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
		const client = new SSEClient({ baseUrl: "http://lab.test" });
		const received: unknown[] = [];
		client.on("timer_expired", (data) => received.push(data));

		client.connect("s1");
		lastSource?.emit("timer_expired", {
			timerKey: "page:draft:timer-0",
			expiresAt: 123456,
		});
		client.disconnect();

		expect(received).toEqual([
			{ timerKey: "page:draft:timer-0", expiresAt: 123456 },
		]);
	});
});
