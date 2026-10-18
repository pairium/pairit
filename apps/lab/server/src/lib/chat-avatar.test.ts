import { describe, expect, test } from "bun:test";
import { getAgentsFromConfig } from "./agents";
import { resolveParticipantAvatar, toAvatarString } from "./chat-avatar";

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
