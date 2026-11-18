import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ChatView } from "./ChatView";

beforeAll(() => {
	// jsdom has no scrollIntoView
	Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

function typeAndSend(text: string) {
	const input = screen.getByPlaceholderText(
		"Type a message...",
	) as HTMLTextAreaElement;
	fireEvent.change(input, { target: { value: text } });
	fireEvent.click(screen.getByRole("button", { name: "Send" }));
	return input;
}

describe("ChatView", () => {
	it("shows the notice above the input", () => {
		render(<ChatView messages={[]} onSend={() => {}} notice="Slow down." />);
		expect(screen.getByRole("status").textContent).toBe("Slow down.");
	});

	it("shows no notice by default", () => {
		render(<ChatView messages={[]} onSend={() => {}} />);
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("clears the input when the message is sent", async () => {
		const onSend = vi.fn(async () => undefined);
		render(<ChatView messages={[]} onSend={onSend} />);
		const input = typeAndSend("hello");
		expect(onSend).toHaveBeenCalledWith("hello");
		await waitFor(() => expect(input.value).toBe(""));
	});

	it("puts the text back when the message was not sent", async () => {
		render(<ChatView messages={[]} onSend={async () => false} />);
		const input = typeAndSend("hello");
		await waitFor(() => expect(input.value).toBe("hello"));
	});
});
