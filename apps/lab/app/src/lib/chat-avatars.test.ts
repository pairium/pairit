import { Bot, Leaf, Sparkles, Sun, User } from "lucide-react";
import { describe, expect, test } from "vitest";
import { isAllowedParticipantImage, resolveChatAvatar } from "./chat-avatars";

const participant = {
	senderId: "p_Qx3vK9mZ2bLa",
	senderType: "participant" as const,
	isOwn: false,
};
const agent = {
	senderId: "agent:tutor",
	senderType: "agent" as const,
	isOwn: false,
};

describe("resolveChatAvatar", () => {
	test("strings are icons unless they look like a path or URL", () => {
		expect(resolveChatAvatar({ ...participant, avatar: "sun" })).toEqual({
			type: "icon",
			icon: Sun,
		});
		expect(
			resolveChatAvatar({ ...participant, avatar: "/avatars/a.png" }),
		).toEqual({ type: "image", src: "/avatars/a.png" });
		expect(
			resolveChatAvatar({
				...participant,
				avatar: "https://x.test/a.png",
				avatars: { participant: "https://x.test/a.png" },
			}),
		).toEqual({ type: "image", src: "https://x.test/a.png" });
	});

	test("a participant's avatar can't point at another server", () => {
		const fallback = resolveChatAvatar(participant);
		for (const avatar of [
			"https://tracker.example/p.png",
			"//tracker.example/p.png",
			"/\\tracker.example/p.png",
			"data:image/svg+xml,<svg/>",
		]) {
			expect(
				resolveChatAvatar({
					...participant,
					avatar,
					avatars: { participant: "{{session_state.avatar}}" },
				}),
			).toEqual(fallback);
			expect(
				resolveChatAvatar({ ...participant, isOwn: true, avatar })?.type,
			).toBe("icon");
		}
	});

	test("a filled avatar may use the origin its template fixes", () => {
		const avatars = {
			participant: "https://cdn.example.com/{{session_state.role}}.png",
		};
		expect(
			resolveChatAvatar({
				...participant,
				avatar: "https://cdn.example.com/leader.png",
				avatars,
			}),
		).toEqual({ type: "image", src: "https://cdn.example.com/leader.png" });
		expect(
			isAllowedParticipantImage(
				"https://cdn.example.com.evil.test/x.png",
				avatars.participant,
			),
		).toBe(false);
	});

	test("agent avatars from the config can be any URL", () => {
		expect(
			resolveChatAvatar({ ...agent, avatar: "https://cdn.example.com/b.png" }),
		).toEqual({ type: "image", src: "https://cdn.example.com/b.png" });
	});

	test("the message avatar beats the participant override", () => {
		expect(
			resolveChatAvatar({
				...participant,
				avatar: "sun",
				avatars: { participant: "leaf" },
			}),
		).toEqual({ type: "icon", icon: Sun });
		expect(
			resolveChatAvatar({ ...participant, avatars: { participant: "leaf" } }),
		).toEqual({ type: "icon", icon: Leaf });
	});

	test("unknown icons and unresolved templates fall through", () => {
		expect(
			resolveChatAvatar({
				...participant,
				avatar: "not-an-icon",
				avatars: { participant: "{{session_state.avatar}}" },
			})?.type,
		).toBe("icon");
	});

	test("self override only applies to own messages", () => {
		const own = { ...participant, isOwn: true, avatar: "sun" };
		expect(resolveChatAvatar({ ...own, avatars: { self: "leaf" } })).toEqual({
			type: "icon",
			icon: Leaf,
		});
		expect(resolveChatAvatar(own)).toEqual({ type: "icon", icon: Sun });
		expect(resolveChatAvatar({ ...own, avatar: undefined })).toEqual({
			type: "icon",
			icon: User,
		});
	});

	test("agents: specific override, then message, then agent, then Bot", () => {
		expect(
			resolveChatAvatar({
				...agent,
				avatar: "sparkles",
				avatars: { agents: { tutor: "leaf" }, agent: "sun" },
			}),
		).toEqual({ type: "icon", icon: Leaf });
		expect(
			resolveChatAvatar({
				...agent,
				avatar: "sparkles",
				avatars: { agent: "sun" },
			}),
		).toEqual({ type: "icon", icon: Sparkles });
		expect(resolveChatAvatar({ ...agent, avatars: { agent: "sun" } })).toEqual({
			type: "icon",
			icon: Sun,
		});
		expect(resolveChatAvatar(agent)).toEqual({ type: "icon", icon: Bot });
	});
});
