export interface PageNode {
	id: string;
	end: boolean;
	componentTypes: string[];
}

export interface PageEdge {
	source: string;
	target: string;
	label?: string;
}

export interface PageGraph {
	initialPageId: string | null;
	nodes: PageNode[];
	edges: PageEdge[];
}

type Unknown = Record<string, unknown>;

function asArray(v: unknown): unknown[] {
	return Array.isArray(v) ? v : [];
}

function asObject(v: unknown): Unknown | null {
	return v && typeof v === "object" && !Array.isArray(v)
		? (v as Unknown)
		: null;
}

function asString(v: unknown): string | null {
	return typeof v === "string" ? v : null;
}

/**
 * Normalize pages to an array. Raw configs use `pages: Page[]`; compiled
 * configs (what the lab consumes / what the server returns) store
 * `pages: Record<string, Page>` keyed by id. Both shapes appear depending on
 * whether we're reading from `rawYaml` or `config.pages`.
 */
function pagesToArray(v: unknown): unknown[] {
	if (Array.isArray(v)) return v;
	const obj = asObject(v);
	return obj ? Object.values(obj) : [];
}

/** Walk a component subtree and call cb for every `action: { type, target }`. */
function visitActions(component: unknown, cb: (action: Unknown) => void): void {
	const obj = asObject(component);
	if (!obj) return;

	const action = asObject(obj.action);
	if (action) cb(action);

	for (const value of Object.values(obj)) {
		if (Array.isArray(value)) {
			for (const item of value) visitActions(item, cb);
		} else if (value && typeof value === "object") {
			visitActions(value, cb);
		}
	}
}

export function buildPageGraph(config: unknown): PageGraph {
	const root = asObject(config);
	if (!root) return { initialPageId: null, nodes: [], edges: [] };

	const initialPageId = asString(root.initialPageId);
	const pages = pagesToArray(root.pages);
	const nodes: PageNode[] = [];
	const edges: PageEdge[] = [];
	const validIds = new Set<string>();

	for (const page of pages) {
		const p = asObject(page);
		const id = p ? asString(p.id) : null;
		if (id) validIds.add(id);
	}

	for (const page of pages) {
		const p = asObject(page);
		if (!p) continue;
		const id = asString(p.id);
		if (!id) continue;

		const components = asArray(p.components);
		const componentTypes: string[] = [];
		for (const c of components) {
			const co = asObject(c);
			const type = co ? asString(co.type) : null;
			if (type) componentTypes.push(type);
		}

		nodes.push({
			id,
			end: p.end === true,
			componentTypes,
		});

		for (const c of components) {
			visitActions(c, (action) => {
				const target = asString(action.target);
				if (!target || !validIds.has(target)) return;
				const actionType = asString(action.type) ?? "action";
				const buttonId = asString((asObject(action) as Unknown).id);
				edges.push({
					source: id,
					target,
					label: buttonId ?? actionType,
				});
			});
		}
	}

	// Matchmaking timeouts → edges to timeoutTarget
	const matchmaking = asArray(root.matchmaking);
	for (const m of matchmaking) {
		const mo = asObject(m);
		if (!mo) continue;
		const timeoutTarget = asString(mo.timeoutTarget);
		if (!timeoutTarget || !validIds.has(timeoutTarget)) continue;
		// Attach the edge to every page whose components include a `matchmaking` block
		// with this pool id.
		const poolId = asString(mo.id);
		for (const page of pages) {
			const p = asObject(page);
			if (!p) continue;
			const pageId = asString(p.id);
			if (!pageId) continue;
			let matches = false;
			for (const c of asArray(p.components)) {
				const co = asObject(c);
				if (co?.type !== "matchmaking") continue;
				const props = asObject(co.props);
				if (props && (poolId === null || asString(props.poolId) === poolId)) {
					matches = true;
					break;
				}
			}
			if (matches) {
				edges.push({
					source: pageId,
					target: timeoutTarget,
					label: `timeout (${poolId ?? "pool"})`,
				});
			}
		}
	}

	return { initialPageId, nodes, edges };
}
