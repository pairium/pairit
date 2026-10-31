// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import "./index";
import { pickKeys } from "../components/Html/bridge";
import { evaluateExpression, type GroupView } from "./expression";
import { PageRenderer } from "./renderer";
import type { Page } from "./types";

afterEach(cleanup);

const group: GroupView = {
	ws: { r1_team_answer: "52" },
	others: [{ r1_estimate: 65 }],
};

describe("evaluateExpression with group", () => {
	const scope = { session_state: { r1_estimate: 40 }, group };

	test("reads group workspace fields and other members' values", () => {
		expect(evaluateExpression('group.ws.r1_team_answer == "52"', scope)).toBe(
			true,
		);
		expect(evaluateExpression("group.others.0.r1_estimate > 50", scope)).toBe(
			true,
		);
		expect(evaluateExpression("session_state.r1_estimate < 50", scope)).toBe(
			true,
		);
	});

	test("is false for a member or field that isn't there", () => {
		expect(evaluateExpression("group.others.1.r1_estimate > 0", scope)).toBe(
			false,
		);
		expect(
			evaluateExpression("group.others.0.r1_estimate > 0", {
				session_state: {},
			}),
		).toBe(false);
	});
});

describe("PageRenderer with group", () => {
	const page: Page = {
		id: "discuss",
		components: [
			{
				type: "text",
				props: {
					text: "You said {{session_state.r1_estimate}}. Your partner said {{group.others.0.r1_estimate}}. Team: {{group.ws.r1_team_answer}}",
				},
			},
			{
				type: "text",
				when: "group.others.0.r1_estimate > 50",
				props: { text: "Your partner guessed higher." },
			},
		],
	};

	test("templates and when read the group view", () => {
		render(
			<PageRenderer
				page={page}
				onAction={vi.fn()}
				sessionState={{ r1_estimate: 40 }}
				group={group}
			/>,
		);
		expect(
			screen.getByText("You said 40. Your partner said 65. Team: 52"),
		).toBeTruthy();
		expect(screen.getByText("Your partner guessed higher.")).toBeTruthy();
	});

	test("before the group view arrives, group paths stay unresolved", () => {
		render(
			<PageRenderer
				page={page}
				onAction={vi.fn()}
				sessionState={{ r1_estimate: 40 }}
			/>,
		);
		expect(screen.queryByText("Your partner guessed higher.")).toBeNull();
	});
});

describe("embed read", () => {
	test("`group` in read sends the group view", () => {
		expect(
			pickKeys({ r1_estimate: 40, secret: 1, group }, ["r1_estimate", "group"]),
		).toEqual({ r1_estimate: 40, group });
	});
});
