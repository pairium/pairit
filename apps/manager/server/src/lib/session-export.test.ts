import { describe, expect, test } from "bun:test";
import type { SessionDocument } from "../types";
import { toSessionExport } from "./session-export";

const base: SessionDocument = {
	id: "s1",
	configId: "trust-abc",
	config: {},
	currentPageId: "intro",
	session_state: {},
	endedAt: null,
	createdAt: new Date("2026-10-01T00:00:00Z"),
	updatedAt: new Date("2026-10-01T00:05:00Z"),
};

describe("toSessionExport", () => {
	test("includes provenance", () => {
		const row = toSessionExport({
			...base,
			configRevision: 2,
			configChecksum: "abc",
			labVersion: "5872c74",
			labRevision: "lab-00042",
		});
		expect(row).toMatchObject({
			configRevision: 2,
			configChecksum: "abc",
			labVersion: "5872c74",
			labRevision: "lab-00042",
		});
	});

	test("legacy sessions export null provenance", () => {
		const row = toSessionExport(base);
		expect(row.configRevision).toBeNull();
		expect(row.configChecksum).toBeNull();
		expect(row.labVersion).toBeNull();
		expect(row.labRevision).toBeNull();
		expect(row.status).toBe("in_progress");
	});
});
