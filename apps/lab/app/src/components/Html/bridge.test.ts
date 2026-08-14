import { afterEach, describe, expect, test } from "vitest";
import {
	filterWritePayload,
	PAIRIT_HELPER_SCRIPT,
	parseEmbedMessage,
	pickKeys,
} from "./bridge";

type PairitApi = {
	state: Record<string, unknown>;
	ready: (fn: (state: Record<string, unknown>) => void) => void;
};

const helperFrames: HTMLIFrameElement[] = [];

function loadHelper() {
	const iframe = document.createElement("iframe");
	document.body.appendChild(iframe);
	helperFrames.push(iframe);
	const win = iframe.contentWindow;
	const doc = iframe.contentDocument;
	if (!win || !doc) throw new Error("missing iframe window");
	const script = doc.createElement("script");
	script.textContent = PAIRIT_HELPER_SCRIPT;
	doc.documentElement.appendChild(script);
	return {
		win,
		pairit: (win as unknown as { pairit: PairitApi }).pairit,
	};
}

function sendInit(win: Window, state: Record<string, unknown>) {
	win.dispatchEvent(
		new MessageEvent("message", {
			data: { type: "pairit:init", state },
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

	test("accepts known pairit messages from the expected source", () => {
		expect(
			parseEmbedMessage(
				{ source, data: { type: "pairit:setState", data: { rating: 4 } } },
				source,
			),
		).toEqual({ type: "pairit:setState", data: { rating: 4 } });
		expect(
			parseEmbedMessage({ source, data: { type: "pairit:done" } }, source),
		).toEqual({ type: "pairit:done" });
	});

	test("ignores messages from other sources", () => {
		expect(
			parseEmbedMessage(
				{ source: { id: "other" }, data: { type: "pairit:done" } },
				source,
			),
		).toBeNull();
		expect(
			parseEmbedMessage(
				{ source: null, data: { type: "pairit:done" } },
				source,
			),
		).toBeNull();
		expect(
			parseEmbedMessage({ source, data: { type: "pairit:done" } }, null),
		).toBeNull();
	});

	test("ignores unknown message types", () => {
		expect(
			parseEmbedMessage({ source, data: { type: "pairit:init" } }, source),
		).toBeNull();
		expect(
			parseEmbedMessage({ source, data: { type: "hack" } }, source),
		).toBeNull();
		expect(parseEmbedMessage({ source, data: "done" }, source)).toBeNull();
	});
});

describe("pairit.ready", () => {
	afterEach(() => {
		for (const iframe of helperFrames) iframe.remove();
		helperFrames.length = 0;
	});

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
		sendInit(win, { treatment: "C" });
		expect(seen).toEqual([{ treatment: "A" }]);
	});
});
