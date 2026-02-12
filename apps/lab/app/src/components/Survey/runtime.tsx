import { submitEvent, updateState } from "@app/lib/api";
import { defineRuntimeComponent } from "@app/runtime/define-runtime-component";
import type { SurveyProps } from "./Survey";
import { Survey } from "./Survey";

export const SurveyRuntime = defineRuntimeComponent<
	"survey",
	Partial<SurveyProps>
>({
	type: "survey",
	renderer: ({ component, context }) => {
		const props = component.props as Partial<SurveyProps>;

		const handleSubmit = async (values: Record<string, unknown>) => {
			if (props.onSubmitValues) {
				await props.onSubmitValues(values);
			}

			if (context.sessionId) {
				try {
					await submitEvent(context.sessionId, {
						type: "survey_submission",
						timestamp: new Date().toISOString(),
						componentType: "survey",
						componentId: component.id ?? "unknown",
						data: values,
					});
					// Update user_state with survey values
					await updateState(context.sessionId, values);
					context.onUserStateChange?.(values);
				} catch (error) {
					console.error("Failed to submit survey event", error);
				}
			}
		};

		return (
			<Survey
				{...props}
				onSubmitValues={handleSubmit}
				registerNavigationGuard={
					props.registerNavigationGuard ?? context.registerNavigationGuard
				}
			/>
		);
	},
});
