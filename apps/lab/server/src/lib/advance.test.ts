import { describe, expect, test } from "bun:test";
import { checkAdvance } from "./advance";

const config = {
	initialPageId: "intro",
	pages: {
		intro: {
			id: "intro",
			components: [
				{
					type: "buttons",
					props: {
						buttons: [{ id: "n", action: { type: "go_to", target: "survey" } }],
					},
				},
			],
		},
		survey: {
			id: "survey",
			components: [
				{
					type: "buttons",
					props: {
						buttons: [{ id: "n", action: { type: "go_to", target: "end" } }],
					},
				},
			],
		},
		end: { id: "end", end: true },
	},
};

describe("checkAdvance", () => {
	test("allows a linked page", () => {
		const r = checkAdvance({ config, currentPageId: "intro" }, "survey");
		expect(r).toEqual({ ok: true, page: config.pages.survey });
	});

	test("allows staying on the current page", () => {
		expect(checkAdvance({ config, currentPageId: "intro" }, "intro").ok).toBe(
			true,
		);
	});

	test("rejects an unknown page", () => {
		expect(checkAdvance({ config, currentPageId: "intro" }, "nope")).toEqual({
			ok: false,
			status: 400,
			error: "unknown_page",
		});
	});

	test("rejects skipping to a page the current page doesn't link to", () => {
		expect(checkAdvance({ config, currentPageId: "intro" }, "end")).toEqual({
			ok: false,
			status: 400,
			error: "invalid_transition",
		});
	});

	test("rejects any move after the session ended", () => {
		expect(
			checkAdvance(
				{ config, currentPageId: "survey", endedAt: "2026-01-01" },
				"end",
			),
		).toEqual({ ok: false, status: 409, error: "session_ended" });
	});
});
