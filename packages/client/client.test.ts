import { afterEach, describe, expect, mock, test } from "bun:test";
import {
	AuthRequiredError,
	LabClient,
	NotAMemberError,
	SessionBlockedError,
} from "./client";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

describe("LabClient", () => {
	test("uses configured baseUrl and credentials", async () => {
		const fetchMock = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				expect(String(input)).toBe("http://lab.test/sessions/abc");
				expect(init?.credentials).toBe("omit");
				return jsonResponse({
					sessionId: "abc",
					currentPageId: "p",
					page: { id: "p" },
					endedAt: null,
				});
			},
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const client = new LabClient({
			baseUrl: "http://lab.test",
			credentials: "omit",
		});
		const result = await client.getSession("abc");

		expect(result.sessionId).toBe("abc");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test("defaults credentials to include", async () => {
		const fetchMock = mock(
			async (_input: RequestInfo | URL, init?: RequestInit) => {
				expect(init?.credentials).toBe("include");
				return jsonResponse({
					sessionId: "s1",
					currentPageId: "p",
					page: { id: "p" },
					endedAt: null,
				});
			},
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const client = new LabClient({ baseUrl: "" });
		await client.getSession("s1");
	});

	test("startSession throws AuthRequiredError on 401", async () => {
		globalThis.fetch = mock(async () =>
			jsonResponse({}, 401),
		) as unknown as typeof fetch;
		const client = new LabClient({ baseUrl: "http://lab.test" });
		await expect(client.startSession("cfg")).rejects.toBeInstanceOf(
			AuthRequiredError,
		);
	});

	test("startSession throws SessionBlockedError on 409", async () => {
		globalThis.fetch = mock(async () =>
			jsonResponse({ message: "already done" }, 409),
		) as unknown as typeof fetch;
		const client = new LabClient({ baseUrl: "http://lab.test" });
		await expect(client.startSession("cfg")).rejects.toBeInstanceOf(
			SessionBlockedError,
		);
	});

	test("sendChatMessage throws NotAMemberError on 403", async () => {
		globalThis.fetch = mock(async () =>
			jsonResponse({}, 403),
		) as unknown as typeof fetch;
		const client = new LabClient({ baseUrl: "http://lab.test" });
		await expect(
			client.sendChatMessage("g1", "s1", "hi"),
		).rejects.toBeInstanceOf(NotAMemberError);
	});

	test("retries a start once when a parallel start races the cookie", async () => {
		const responses = [
			jsonResponse(
				{ status: "blocked", error: "session_in_other_browser", message: "m" },
				409,
			),
			jsonResponse({
				status: "resumed",
				sessionId: "s1",
				currentPageId: "p",
				page: { id: "p" },
			}),
		];
		const fetchMock = mock(async () => responses.shift() as Response);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const client = new LabClient({ baseUrl: "http://lab.test" });
		const r = await client.startSession("cfg", null);
		expect(r.sessionId).toBe("s1");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	test("encodes ids in request paths", async () => {
		const urls: string[] = [];
		const fetchMock = mock(async (input: RequestInfo | URL) => {
			urls.push(String(input));
			return jsonResponse({ ok: true, messages: [] });
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const client = new LabClient({ baseUrl: "http://lab.test" });
		await client.getSession("a/../b?c");
		await client.getChatHistory("g/../x", "s#1");
		expect(urls).toEqual([
			"http://lab.test/sessions/a%2F..%2Fb%3Fc",
			"http://lab.test/chat/g%2F..%2Fx/history?sessionId=s%231",
		]);
	});

	test("reports a session open in another browser", async () => {
		const fetchMock = mock(async () =>
			jsonResponse(
				{
					status: "blocked",
					error: "session_in_other_browser",
					message: "Continue in the browser where you started this study.",
				},
				409,
			),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const client = new LabClient({ baseUrl: "http://lab.test" });
		const err = await client.startSession("cfg", null).catch((e) => e);
		expect(err).toBeInstanceOf(SessionBlockedError);
		expect(err.reason).toBe("session_in_other_browser");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
