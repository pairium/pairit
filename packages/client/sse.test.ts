import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { SSEClient } from "./sse";

const OriginalEventSource = globalThis.EventSource;
const opened: string[] = [];

class FakeEventSource {
	static readonly OPEN = 1;
	static readonly CLOSED = 2;
	readyState = 0;
	onopen: (() => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;
	constructor(url: string) {
		opened.push(url);
	}
	addEventListener() {}
	close() {}
}

afterEach(() => {
	globalThis.EventSource = OriginalEventSource;
	opened.length = 0;
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
});
