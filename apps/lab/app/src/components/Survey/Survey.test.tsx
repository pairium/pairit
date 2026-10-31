// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { Survey } from "./Survey";

afterEach(cleanup);

function radioValues(): string[] {
	return screen
		.getAllByRole("radio")
		.map((radio) => (radio as HTMLInputElement).value);
}

describe("Survey likert", () => {
	test("uses agree/disagree labels by default", () => {
		render(
			<Survey items={[{ id: "q", text: "Q", answer: { likert5: {} } }]} />,
		);

		expect(screen.getByText("Strongly disagree")).toBeTruthy();
		expect(screen.getByText("Strongly agree")).toBeTruthy();
		expect(radioValues()).toEqual(["1", "2", "3", "4", "5"]);
	});

	test("min_label and max_label number the points and label the ends", () => {
		render(
			<Survey
				items={[
					{
						id: "q",
						text: "Q",
						answer: {
							likert7: {
								layout: "horizontal",
								min_label: "Not at all",
								max_label: "Extremely",
							},
						},
					},
				]}
			/>,
		);

		expect(screen.queryByText("Strongly disagree")).toBeNull();
		expect(screen.getByText("Not at all").closest("label")?.textContent).toBe(
			"1Not at all",
		);
		expect(screen.getByText("Extremely").closest("label")?.textContent).toBe(
			"7Extremely",
		);
		expect(screen.getByText("4")).toBeTruthy();
		expect(radioValues()).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
	});

	test("choices replace every label and keep their values", () => {
		render(
			<Survey
				items={[
					{
						id: "q",
						text: "Q",
						answer: {
							likert5: {
								choices: [
									{ value: "1", label: "Never" },
									{ value: "2", label: "Rarely" },
									{ value: "3", label: "Sometimes" },
									{ value: "4", label: "Often" },
									{ value: "5", label: "Always" },
								],
							},
						},
					},
				]}
			/>,
		);

		expect(screen.getByRole("radio", { name: "Never" })).toBeTruthy();
		expect(screen.getByRole("radio", { name: "Always" })).toBeTruthy();
		expect(radioValues()).toEqual(["1", "2", "3", "4", "5"]);
	});
});
