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
});
