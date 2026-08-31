// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { RadioGroup, RadioGroupItem } from "./RadioGroup";

describe("RadioGroupItem", () => {
	test("centers the radio and label inside each option card", () => {
		render(
			<RadioGroup value={null} onValueChange={() => undefined}>
				<RadioGroupItem value="never" label="Never" />
			</RadioGroup>,
		);

		const option = screen.getByText("Never").closest("label");
		expect(option).toBeTruthy();
		expect(option?.className).toContain("items-center");
		expect(option?.className).not.toContain("items-start");

		const radio = screen.getByRole("radio", { name: "Never" });
		expect(radio.className).toContain("m-0");
		expect(radio.parentElement?.className).not.toContain("mt-1");
	});
});
