import { describe, expect, test } from "vitest";
import { filterWritePayload, parseEmbedMessage, pickKeys } from "./bridge";

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
