import { defineRuntimeComponent } from "@app/runtime/define-runtime-component";
import type { TextComponent } from "@app/runtime/types";
import Markdown from "react-markdown";

export const TextRuntime = defineRuntimeComponent<
	"text",
	TextComponent["props"]
>({
	type: "text",
	renderer: ({ component }) => {
		const text = component.props.text;
		if (!text) {
			return null;
		}

		return (
			<div className="prose prose-slate max-w-none">
				<Markdown>{text}</Markdown>
			</div>
		);
	},
});
