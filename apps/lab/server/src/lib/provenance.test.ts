import { describe, expect, test } from "bun:test";
import { buildProvenance } from "./provenance";

describe("buildProvenance", () => {
	test("records config revision and deployed build", () => {
		expect(
			buildProvenance(
				{ revision: 3, checksum: "abc" },
				{ GIT_SHA: "5872c74", K_REVISION: "lab-00042" },
			),
		).toEqual({
			configRevision: 3,
			configChecksum: "abc",
			labVersion: "5872c74",
			labRevision: "lab-00042",
		});
	});

	test("local dev and legacy configs", () => {
		expect(buildProvenance({ checksum: "abc" }, {})).toEqual({
			configRevision: null,
			configChecksum: "abc",
			labVersion: "dev",
			labRevision: null,
		});
	});

	test("missing config", () => {
		expect(buildProvenance(null, {}).configChecksum).toBeNull();
	});
});
