import { submitEvent, updateState } from "@app/lib/api";
import { defineRuntimeComponent } from "@app/runtime/define-runtime-component";
import type { RuntimeComponentContext } from "@app/runtime/registry";
import type { ButtonAction, ComponentInstance } from "@app/runtime/types";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	filterWritePayload,
	parseEmbedMessage,
	pickKeys,
	wrapHtmlSrcdoc,
} from "./bridge";
import { HtmlEmbed } from "./HtmlEmbed";

export type HtmlProps = {
	src?: string;
	html?: string;
	read?: string[];
	write?: string[];
	height?: number;
	required?: boolean;
	action?: ButtonAction;
};

type HtmlComponent = ComponentInstance<"html", HtmlProps>;

export const HtmlRuntime = defineRuntimeComponent<"html", HtmlProps>({
	type: "html",
	renderer: ({ component, context }) => {
		const html =
			typeof component.props.html === "string" ? component.props.html : "";
		const readKeys = stringList(component.props.read);
		const writeKeys = stringList(component.props.write);
		const height =
			typeof component.props.height === "number" && component.props.height > 0
				? component.props.height
				: 400;
		const required = component.props.required === true;
		const action = component.props.action;

		const iframeRef = useRef<HTMLIFrameElement>(null);
		const doneRef = useRef(false);
		const [done, setDone] = useState(false);
		const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

		const componentRef = useRef(component);
		componentRef.current = component;
		const contextRef = useRef(context);
		contextRef.current = context;
		const writeKeysRef = useRef(writeKeys);
		writeKeysRef.current = writeKeys;
		const actionRef = useRef(action);
		actionRef.current = action;

		const srcdoc = useMemo(() => wrapHtmlSrcdoc(html), [html]);
		const registerNavigationGuard = context.registerNavigationGuard;

		useEffect(() => {
			if (!required) return;
			return registerNavigationGuard(() => {
				if (doneRef.current) return true;
				setBlockedMessage("Complete the task above to continue.");
				return false;
			});
		}, [required, registerNavigationGuard]);

		useEffect(() => {
			const onMessage = (event: MessageEvent) => {
				const parsed = parseEmbedMessage(
					event,
					iframeRef.current?.contentWindow,
				);
				if (!parsed) return;

				if (parsed.type === "pairit:setState") {
					const updates = filterWritePayload(parsed.data, writeKeysRef.current);
					if (Object.keys(updates).length === 0) return;
					const sessionId = contextRef.current.sessionId;
					if (sessionId) {
						updateState(sessionId, updates).catch((error) => {
							console.error("[Html] Failed to update state", error);
						});
					}
					contextRef.current.onSessionStateChange?.(updates);
					emitHtmlEvent("onState", componentRef.current, contextRef.current, {
						updates,
					});
					return;
				}

				if (parsed.type === "pairit:event") {
					const name =
						typeof parsed.name === "string" && parsed.name
							? parsed.name
							: "onState";
					const data =
						parsed.data &&
						typeof parsed.data === "object" &&
						!Array.isArray(parsed.data)
							? (parsed.data as Record<string, unknown>)
							: {};
					emitHtmlEvent(name, componentRef.current, contextRef.current, data);
					return;
				}

				if (parsed.type === "pairit:done") {
					doneRef.current = true;
					setDone(true);
					setBlockedMessage(null);
					emitHtmlEvent("onDone", componentRef.current, contextRef.current);
					const nextAction = actionRef.current;
					if (nextAction) {
						applySetState(nextAction, contextRef.current);
						void contextRef.current.onAction(nextAction);
					}
				}
			};

			window.addEventListener("message", onMessage);
			return () => {
				window.removeEventListener("message", onMessage);
			};
		}, []);

		if (!html) {
			const src =
				typeof component.props.src === "string"
					? component.props.src
					: "HTML file";
			return (
				<div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
					This HTML embed has no uploaded file ({src}). Upload the config with{" "}
					<code>pairit config upload</code>.
				</div>
			);
		}

		return (
			<div className="space-y-2">
				<HtmlEmbed
					iframeRef={iframeRef}
					srcdoc={srcdoc}
					height={height}
					onLoad={() => {
						emitHtmlEvent("onLoad", component, context);
						const state = pickKeys(context.sessionState, readKeys);
						iframeRef.current?.contentWindow?.postMessage(
							{ type: "pairit:init", state },
							"*",
						);
					}}
				/>
				{required && !done && blockedMessage ? (
					<p className="text-sm text-amber-700">{blockedMessage}</p>
				) : null}
			</div>
		);
	},
});

function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string");
}

function applySetState(action: ButtonAction, context: RuntimeComponentContext) {
	if (!action.setState || !context.sessionId) return;
	updateState(context.sessionId, action.setState).catch((error) => {
		console.error("[Html] Failed to apply setState", error);
	});
	context.onSessionStateChange?.(action.setState);
}

function emitHtmlEvent(
	eventName: string,
	component: HtmlComponent,
	context: RuntimeComponentContext,
	extra?: Record<string, unknown>,
) {
	if (!context.sessionId) return;
	const eventConfig =
		component.events?.[eventName as keyof NonNullable<HtmlComponent["events"]>];
	submitEvent(context.sessionId, {
		type: eventConfig?.type ?? eventName,
		timestamp: new Date().toISOString(),
		componentType: "html",
		componentId: component.id ?? "unknown",
		data: {
			event: eventName,
			...extra,
			...eventConfig?.data,
		},
	}).catch((error) => {
		console.error(`[Html] Failed to submit ${eventName} event`, error);
	});
}
