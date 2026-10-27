export const HTML_CSP =
	"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:";

export const PAIRIT_HELPER_SCRIPT = `(function(){
  var state = {};
  var ready = false;
  var readyFns = [];
  var stateFns = [];
  function runCallback(fn) {
    try { fn(state); } catch (err) { console.error(err); }
  }
  function applyState(nextState, isInit) {
    state = nextState || {};
    if (isInit) {
      ready = true;
      var fns = readyFns;
      readyFns = [];
      window.dispatchEvent(new CustomEvent("pairit:init", { detail: state }));
      for (var i = 0; i < fns.length; i++) runCallback(fns[i]);
    }
    for (var j = 0; j < stateFns.length; j++) runCallback(stateFns[j]);
  }
  window.pairit = {
    get state() { return state; },
    setState: function(data) {
      parent.postMessage({ type: "pairit:setState", data: data || {} }, "*");
    },
    event: function(name, data) {
      parent.postMessage({ type: "pairit:event", name: name, data: data || {} }, "*");
    },
    done: function() {
      parent.postMessage({ type: "pairit:done" }, "*");
    },
    ready: function(fn) {
      if (typeof fn !== "function") return;
      if (ready) {
        runCallback(fn);
        return;
      }
      readyFns.push(fn);
    },
    onState: function(fn) {
      if (typeof fn !== "function") return;
      stateFns.push(fn);
      if (ready) {
        runCallback(fn);
      }
    }
  };
  window.addEventListener("message", function(event) {
    if (!event.data) return;
    if (event.data.type === "pairit:init") {
      applyState(event.data.state, true);
      return;
    }
    if (event.data.type === "pairit:state") {
      applyState(event.data.state, false);
    }
  });
})();`;

export type PairitSetStateMessage = {
	type: "pairit:setState";
	data?: unknown;
};

export type PairitEventMessage = {
	type: "pairit:event";
	name?: unknown;
	data?: unknown;
};

export type PairitDoneMessage = {
	type: "pairit:done";
};

export type PairitFromEmbed =
	| PairitSetStateMessage
	| PairitEventMessage
	| PairitDoneMessage;

export function pickKeys(
	source: Record<string, unknown> | undefined,
	keys: string[] | undefined,
): Record<string, unknown> {
	if (!source || !keys?.length) return {};
	const out: Record<string, unknown> = {};
	for (const key of keys) {
		if (key in source) {
			out[key] = source[key];
		}
	}
	return out;
}

export function isPairitFromEmbed(data: unknown): data is PairitFromEmbed {
	if (!data || typeof data !== "object") return false;
	const type = (data as { type?: unknown }).type;
	return (
		type === "pairit:setState" ||
		type === "pairit:event" ||
		type === "pairit:done"
	);
}

export function parseEmbedMessage(
	event: { source: unknown; data: unknown },
	expectedSource: unknown,
): PairitFromEmbed | null {
	if (!expectedSource || event.source !== expectedSource) return null;
	if (!isPairitFromEmbed(event.data)) return null;
	return event.data;
}

export function filterWritePayload(
	data: unknown,
	writeKeys: string[] | undefined,
): Record<string, unknown> {
	if (!data || typeof data !== "object" || Array.isArray(data)) return {};
	return pickKeys(data as Record<string, unknown>, writeKeys);
}

/**
 * The helper a workspace's custom renderer gets as `pairit.workspace`:
 * `text`, `onChange(fn)` called with the text on load and every change, and
 * `replace(old, new)` which resolves to { ok } or { ok: false, error }.
 */
export const WORKSPACE_HELPER_SCRIPT = `(function(){
  var text = null;
  var changeFns = [];
  var pending = {};
  var nextId = 1;
  function emit() {
    for (var i = 0; i < changeFns.length; i++) {
      try { changeFns[i](text); } catch (err) { console.error(err); }
    }
  }
  window.pairit = window.pairit || {};
  window.pairit.workspace = {
    get text() { return text; },
    onChange: function(fn) {
      if (typeof fn !== "function") return;
      changeFns.push(fn);
      if (text !== null) { try { fn(text); } catch (err) { console.error(err); } }
    },
    replace: function(oldText, newText) {
      var id = nextId++;
      return new Promise(function(resolve) {
        pending[id] = resolve;
        parent.postMessage({ type: "pairit:workspace:replace", id: id, old: String(oldText), new: String(newText) }, "*");
      });
    }
  };
  window.addEventListener("message", function(event) {
    var data = event.data;
    if (!data) return;
    if (data.type === "pairit:workspace") { text = data.text; emit(); return; }
    if (data.type === "pairit:workspace:result" && pending[data.id]) {
      var resolve = pending[data.id];
      delete pending[data.id];
      resolve(data.ok ? { ok: true } : { ok: false, error: data.error });
    }
  });
})();`;

export type WorkspaceReplaceMessage = {
	type: "pairit:workspace:replace";
	id: number;
	old: string;
	new: string;
};

export function parseWorkspaceMessage(
	event: { source: unknown; data: unknown },
	expectedSource: unknown,
): WorkspaceReplaceMessage | null {
	if (!expectedSource || event.source !== expectedSource) return null;
	const data = event.data as Partial<WorkspaceReplaceMessage> | null;
	if (
		data?.type !== "pairit:workspace:replace" ||
		typeof data.id !== "number" ||
		typeof data.old !== "string" ||
		typeof data.new !== "string"
	) {
		return null;
	}
	return data as WorkspaceReplaceMessage;
}

export function wrapHtmlSrcdoc(
	userHtml: string,
	helperScript: string = PAIRIT_HELPER_SCRIPT,
): string {
	const inject = `<meta http-equiv="Content-Security-Policy" content="${HTML_CSP}"><script>${helperScript}</script>`;
	if (/<head[\s>]/i.test(userHtml)) {
		return userHtml.replace(/<head([^>]*)>/i, `<head$1>${inject}`);
	}
	if (/<html[\s>]/i.test(userHtml)) {
		return userHtml.replace(/<html([^>]*)>/i, `<html$1><head>${inject}</head>`);
	}
	return `<!DOCTYPE html><html><head>${inject}</head><body>${userHtml}</body></html>`;
}
