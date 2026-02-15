import "../components/runtime";

export type {
	RuntimeComponentContext,
	RuntimeComponentRenderer,
} from "./registry";
export {
	registerComponent,
	setFallbackComponent,
	unregisterComponent,
} from "./registry";
