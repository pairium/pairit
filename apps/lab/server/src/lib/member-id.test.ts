import { describe, expect, test } from "bun:test";
import { memberId, publicSenderId } from "./member-id";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";

describe("memberId", () => {
	test("is stable within a group", () => {
		expect(memberId("g1", A)).toBe(memberId("g1", A));
	});
	test("differs between members and between groups", () => {
		expect(memberId("g1", A)).not.toBe(memberId("g1", B));
		expect(memberId("g1", A)).not.toBe(memberId("g2", A));
	});
	test("does not contain the sessionId", () => {
		const id = memberId("g1", A);
		expect(id).toMatch(/^p_[A-Za-z0-9_-]{12}$/);
		expect(id).not.toContain(A.slice(0, 8));
	});
});

describe("publicSenderId", () => {
	test("passes agents and system through", () => {
		expect(publicSenderId("g1", "agent:tutor")).toBe("agent:tutor");
		expect(publicSenderId("g1", "system")).toBe("system");
	});
	test("maps participants to member ids", () => {
		expect(publicSenderId("g1", A)).toBe(memberId("g1", A));
	});
});
