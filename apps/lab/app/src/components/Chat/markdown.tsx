import type { ComponentProps } from "react";
import type { Components } from "react-markdown";

function ExternalLink({ children, href }: ComponentProps<"a">) {
	return (
		<a href={href} target="_blank" rel="noopener noreferrer">
			{children}
		</a>
	);
}

// An image from someone else would load from any server they choose and
// reveal the reader's IP address, so it shows as text instead.
function ImageAsText({ alt, src }: ComponentProps<"img">) {
	const text = alt || (typeof src === "string" ? src : "");
	return text ? <span>[image: {text}]</span> : null;
}

/** Markdown for messages from other participants and agents. */
export const OTHERS_MARKDOWN: Components = {
	a: ExternalLink,
	img: ImageAsText,
};
