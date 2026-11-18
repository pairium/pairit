import { describe, expect, test } from "bun:test";
import { getAgentsFromConfig } from "./agents";
import {
	isAllowedFilledAvatar,
	resolveParticipantAvatar,
	toAvatarString,
} from "./chat-avatar";

describe("toAvatarString", () => {
	test("keeps strings and drops empty ones", () => {
		expect(toAvatarString("leaf")).toBe("leaf");
		expect(toAvatarString("/avatars/a.png")).toBe("/avatars/a.png");
		expect(toAvatarString("  ")).toBeUndefined();
		expect(toAvatarString(undefined)).toBeUndefined();
		expect(toAvatarString({ icon: "bot" })).toBeUndefined();
	});

	test("agents keep string avatars and drop anything else", () => {
		const agents = getAgentsFromConfig({
			agents: [
				{ id: "a", model: "m", system: "s", avatar: "sparkles" },
				{ id: "b", model: "m", system: "s", avatar: { image: "/b.png" } },
			],
		});
		expect(agents.map((a) => a.avatar)).toEqual(["sparkles", undefined]);
	});
});

const configWith = (participant: unknown) => ({
	initialPageId: "chat",
	pages: {
		chat: {
			id: "chat",
			components: [
				{ type: "text", props: {} },
				{ type: "chat", props: { avatars: { participant } } },
			],
		},
		other: { id: "other", components: [] },
	},
});

describe("resolveParticipantAvatar", () => {
	test("fills the template from the sender's state", () => {
		const config = configWith("{{session_state.avatar}}");
		expect(resolveParticipantAvatar(config, "chat", { avatar: "sun" })).toBe(
			"sun",
		);
		expect(
			resolveParticipantAvatar(
				configWith("/avatars/{{session_state.role}}.png"),
				"chat",
				{ role: "leader" },
			),
		).toBe("/avatars/leader.png");
	});

	test("drops a filled avatar that points at another server", () => {
		const config = configWith("{{session_state.avatar}}");
		for (const avatar of [
			"https://tracker.example/pixel.png",
			"//tracker.example/pixel.png",
			"/\\tracker.example/pixel.png",
			"data:image/svg+xml,<svg/>",
		]) {
			expect(
				resolveParticipantAvatar(config, "chat", { avatar }),
			).toBeUndefined();
		}
		expect(
			resolveParticipantAvatar(config, "chat", { avatar: "/media/a.png" }),
		).toBe("/media/a.png");
	});

	test("keeps a filled avatar on the origin the template fixes", () => {
		const config = configWith("https://cdn.example.com/{{session_state.r}}");
		expect(resolveParticipantAvatar(config, "chat", { r: "a.png" })).toBe(
			"https://cdn.example.com/a.png",
		);
		expect(
			isAllowedFilledAvatar(
				"https://cdn.example.com{{x}}",
				"https://cdn.example.com.evil.test/",
			),
		).toBe(false);
		expect(
			resolveParticipantAvatar(
				configWith("{{session_state.r}}/a.png"),
				"chat",
				{
					r: "https://evil.test",
				},
			),
		).toBeUndefined();
	});

	test("keeps a static image URL from the config", () => {
		expect(
			resolveParticipantAvatar(
				configWith("https://cdn.example.com/a.png"),
				"chat",
				{},
			),
		).toBe("https://cdn.example.com/a.png");
	});

	test("returns a static avatar as is", () => {
		expect(resolveParticipantAvatar(configWith("leaf"), "chat", {})).toBe(
			"leaf",
		);
	});

	test("is undefined when the key is unset or nothing is configured", () => {
		const config = configWith("{{session_state.avatar}}");
		expect(resolveParticipantAvatar(config, "chat", {})).toBeUndefined();
		expect(
			resolveParticipantAvatar(config, "other", { avatar: "sun" }),
		).toBeUndefined();
		expect(
			resolveParticipantAvatar(configWith(undefined), "chat", {}),
		).toBeUndefined();
	});
});
