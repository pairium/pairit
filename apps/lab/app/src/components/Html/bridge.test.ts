import { afterEach, describe, expect, test } from "vitest";
import {
	filterWritePayload,
	HTML_CSP,
	PAIRIT_HELPER_SCRIPT,
	parseEmbedMessage,
	parseWorkspaceMessage,
	pickKeys,
	WORKSPACE_HELPER_SCRIPT,
	wrapHtmlSrcdoc,
} from "./bridge";

type PairitApi = {
	state: Record<string, unknown>;
	ready: (fn: (state: Record<string, unknown>) => void) => void;
	onState: (fn: (state: Record<string, unknown>) => void) => void;
};

const helperFrames: HTMLIFrameElement[] = [];

afterEach(() => {
	for (const iframe of helperFrames) iframe.remove();
	helperFrames.length = 0;
});

function loadHelper(helper: string = PAIRIT_HELPER_SCRIPT) {
	const iframe = document.createElement("iframe");
	document.body.appendChild(iframe);
	helperFrames.push(iframe);
	const win = iframe.contentWindow;
	const doc = iframe.contentDocument;
	if (!win || !doc) throw new Error("missing iframe window");
	const script = doc.createElement("script");
	script.textContent = helper;
	doc.documentElement.appendChild(script);
	return {
		win,
		pairit: (win as unknown as { pairit: PairitApi }).pairit,
	};
}

// Messages from the lab page come from the embed's parent window
function sendInit(
	win: Window,
	state: Record<string, unknown>,
	source: Window | null = win.parent,
) {
	win.dispatchEvent(
		new MessageEvent("message", {
			data: { type: "pairit:init", state },
			source,
		}),
	);
}

function sendState(win: Window, state: Record<string, unknown>) {
	win.dispatchEvent(
		new MessageEvent("message", {
			data: { type: "pairit:state", state },
			source: win.parent,
		}),
	);
}

describe("pickKeys", () => {
	test("returns only listed keys", () => {
		expect(
			pickKeys({ treatment: "A", secret: 1, rating: 4 }, [
				"treatment",
				"rating",
			]),
		).toEqual({ treatment: "A", rating: 4 });
	});

	test("never reads inherited properties", () => {
		expect(
			pickKeys({ a: 1 }, ["__proto__", "constructor", "toString", "a"]),
		).toEqual({ a: 1 });
	});

	test("returns empty object when keys or source are missing", () => {
		expect(pickKeys(undefined, ["treatment"])).toEqual({});
		expect(pickKeys({ treatment: "A" }, undefined)).toEqual({});
		expect(pickKeys({ treatment: "A" }, [])).toEqual({});
	});
});

describe("filterWritePayload", () => {
	test("keeps only declared write keys", () => {
		expect(
			filterWritePayload({ rating: 4, rt_ms: 12, extra: true }, [
				"rating",
				"rt_ms",
			]),
		).toEqual({ rating: 4, rt_ms: 12 });
	});

	test("drops undeclared keys and non-objects", () => {
		expect(filterWritePayload({ stolen: true }, ["rating"])).toEqual({});
		expect(filterWritePayload("nope", ["rating"])).toEqual({});
		expect(filterWritePayload(["rating"], ["rating"])).toEqual({});
		expect(filterWritePayload(undefined, ["rating"])).toEqual({});
	});
});

describe("parseEmbedMessage", () => {
	const source = { id: "iframe" };
	const origin = "null";

	test("accepts known pairit messages from the expected source", () => {
		expect(
			parseEmbedMessage(
				{
					source,
					origin,
					data: { type: "pairit:setState", data: { rating: 4 } },
				},
				source,
			),
		).toEqual({ type: "pairit:setState", data: { rating: 4 } });
		expect(
			parseEmbedMessage(
				{ source, origin, data: { type: "pairit:done" } },
				source,
			),
		).toEqual({ type: "pairit:done" });
	});

	test("ignores messages from other sources", () => {
		expect(
			parseEmbedMessage(
				{ source: { id: "other" }, origin, data: { type: "pairit:done" } },
				source,
			),
		).toBeNull();
		expect(
			parseEmbedMessage(
				{ source: null, origin, data: { type: "pairit:done" } },
				source,
			),
		).toBeNull();
		expect(
			parseEmbedMessage(
				{ source, origin, data: { type: "pairit:done" } },
				null,
			),
		).toBeNull();
	});

	test("ignores the frame once it has left its srcdoc", () => {
		for (const other of ["https://evil.example", "http://localhost:3000", ""]) {
			expect(
				parseEmbedMessage(
					{ source, origin: other, data: { type: "pairit:done" } },
					source,
				),
			).toBeNull();
		}
	});

	test("ignores unknown message types", () => {
		expect(
			parseEmbedMessage(
				{ source, origin, data: { type: "pairit:init" } },
				source,
			),
		).toBeNull();
		expect(
			parseEmbedMessage({ source, origin, data: { type: "hack" } }, source),
		).toBeNull();
		expect(
			parseEmbedMessage({ source, origin, data: "done" }, source),
		).toBeNull();
	});
});

describe("pairit.ready", () => {
	test("runs after init arrives", () => {
		const { win, pairit } = loadHelper();
		const seen: Array<Record<string, unknown>> = [];
		pairit.ready((state) => {
			seen.push(state);
		});
		expect(seen).toEqual([]);
		sendInit(win, { treatment: "A" });
		expect(seen).toEqual([{ treatment: "A" }]);
		expect(pairit.state).toEqual({ treatment: "A" });
	});

	test("runs immediately if init already happened", () => {
		const { win, pairit } = loadHelper();
		sendInit(win, { treatment: "B" });
		const seen: Array<Record<string, unknown>> = [];
		pairit.ready((state) => {
			seen.push(state);
		});
		expect(seen).toEqual([{ treatment: "B" }]);
	});

	test("fires each ready callback once", () => {
		const { win, pairit } = loadHelper();
		const seen: Array<Record<string, unknown>> = [];
		pairit.ready((state) => {
			seen.push(state);
		});
		sendInit(win, { treatment: "A" });
		sendState(win, { treatment: "C" });
		expect(seen).toEqual([{ treatment: "A" }]);
	});
});

describe("pairit.onState", () => {
	test("runs on init and on later state updates", () => {
		const { win, pairit } = loadHelper();
		const seen: Array<Record<string, unknown>> = [];
		pairit.onState((state) => {
			seen.push(state);
		});
		sendInit(win, { treatment: "A" });
		sendState(win, { treatment: "B" });
		expect(seen).toEqual([{ treatment: "A" }, { treatment: "B" }]);
		expect(pairit.state).toEqual({ treatment: "B" });
	});

	test("runs immediately if init already happened", () => {
		const { win, pairit } = loadHelper();
		sendInit(win, { treatment: "A" });
		const seen: Array<Record<string, unknown>> = [];
		pairit.onState((state) => {
			seen.push(state);
		});
		expect(seen).toEqual([{ treatment: "A" }]);
		sendState(win, { treatment: "C" });
		expect(seen).toEqual([{ treatment: "A" }, { treatment: "C" }]);
	});
});

describe("parseWorkspaceMessage", () => {
	const source = { id: "iframe" };
	const data = { type: "pairit:workspace:replace", id: 1, old: "a", new: "b" };

	test("accepts a replace from the frame's srcdoc", () => {
		expect(
			parseWorkspaceMessage({ source, origin: "null", data }, source),
		).toEqual(data);
	});

	test("ignores other sources and origins", () => {
		expect(
			parseWorkspaceMessage(
				{ source, origin: "https://evil.example", data },
				source,
			),
		).toBeNull();
		expect(
			parseWorkspaceMessage({ source: {}, origin: "null", data }, source),
		).toBeNull();
	});
});

describe("wrapHtmlSrcdoc", () => {
	const prefix = `<!DOCTYPE html><meta http-equiv="Content-Security-Policy" content="${HTML_CSP}"><script>`;

	test("puts the CSP first, whatever the researcher's markup", () => {
		for (const html of [
			"<p>hi</p>",
			"<!DOCTYPE html><html><head><title>x</title></head><body></body></html>",
			"<!-- <head> --><script>fetch('https://x')</script><head></head>",
			'<head data-x=">"><body></body>',
		]) {
			const doc = wrapHtmlSrcdoc(html);
			expect(doc.startsWith(prefix)).toBe(true);
			expect(doc.endsWith(html)).toBe(true);
		}
	});

	test("the CSP applies to the parsed document", () => {
		const parsed = new DOMParser().parseFromString(
			wrapHtmlSrcdoc("<!-- <head> --><html><head></head><body>x</body></html>"),
			"text/html",
		);
		const meta = parsed.head.firstElementChild;
		expect(meta?.getAttribute("http-equiv")).toBe("Content-Security-Policy");
		expect(meta?.getAttribute("content")).toBe(HTML_CSP);
	});
});

describe("helper scripts", () => {
	test("pairit ignores messages that aren't from the parent", () => {
		const { win, pairit } = loadHelper();
		const seen: Array<Record<string, unknown>> = [];
		pairit.onState((state) => seen.push(state));
		sendInit(win, { forged: true }, win);
		sendInit(win, { forged: true }, null);
		expect(seen).toEqual([]);
		sendInit(win, { treatment: "A" });
		expect(seen).toEqual([{ treatment: "A" }]);
	});

	test("pairit.workspace ignores messages that aren't from the parent", () => {
		const { win } = loadHelper(WORKSPACE_HELPER_SCRIPT);
		const workspace = (
			win as unknown as {
				pairit: { workspace: { text: string | null } };
			}
		).pairit.workspace;
		win.dispatchEvent(
			new MessageEvent("message", {
				data: { type: "pairit:workspace", text: "forged" },
				source: win,
			}),
		);
		expect(workspace.text).toBeNull();
		win.dispatchEvent(
			new MessageEvent("message", {
				data: { type: "pairit:workspace", text: "real" },
				source: win.parent,
			}),
		);
		expect(workspace.text).toBe("real");
	});
});
