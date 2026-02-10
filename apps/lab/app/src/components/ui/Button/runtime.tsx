import { submitEvent } from "@app/lib/api";
import { defineRuntimeComponent } from "@app/runtime/define-runtime-component";
import type { RuntimeComponentContext } from "@app/runtime/registry";
import type { ButtonsComponent } from "@app/runtime/types";
import { Button } from "./Button";

type ButtonDefinition = ButtonsComponent["props"]["buttons"][number];

export const ButtonsRuntime = defineRuntimeComponent<
	"buttons",
	ButtonsComponent["props"]
>({
	type: "buttons",
	renderer: ({ component, context }) => {
		const buttons = component.props.buttons ?? [];
		if (!buttons.length) {
			return (
				<div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
					No buttons configured.
				</div>
			);
		}

		return (
			<div className="flex flex-wrap gap-3">
				{buttons.map((button) => (
					<Button
						key={button.id}
						type="button"
						onClick={() =>
							void handleButtonClick(button, component.id, context)
						}
					>
						{button.text}
					</Button>
				))}
			</div>
		);
	},
});

async function handleButtonClick(
	button: ButtonDefinition,
	componentId: string | undefined,
	context: RuntimeComponentContext,
) {
	await emitButtonEvent(button, componentId, context);
	await Promise.resolve(context.onAction(button.action));
}

async function emitButtonEvent(
	button: ButtonDefinition,
	componentId: string | undefined,
	context: RuntimeComponentContext,
) {
	if (!button.events?.onClick || !context.sessionId) return;

	try {
		await submitEvent(context.sessionId, {
			type: button.events.onClick.type ?? "button_click",
			timestamp: new Date().toISOString(),
			componentType: "buttons",
			componentId: componentId ?? "unknown",
			data: {
				button_id: button.id,
				label: button.text,
				...button.events.onClick.data,
			},
		});
	} catch (error) {
		console.error("Failed to submit button event", error);
	}
}
