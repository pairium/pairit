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

export function wrapHtmlSrcdoc(userHtml: string): string {
	const inject = `<meta http-equiv="Content-Security-Policy" content="${HTML_CSP}"><script>${PAIRIT_HELPER_SCRIPT}</script>`;
	if (/<head[\s>]/i.test(userHtml)) {
		return userHtml.replace(/<head([^>]*)>/i, `<head$1>${inject}`);
	}
	if (/<html[\s>]/i.test(userHtml)) {
		return userHtml.replace(/<html([^>]*)>/i, `<html$1><head>${inject}</head>`);
	}
	return `<!DOCTYPE html><html><head>${inject}</head><body>${userHtml}</body></html>`;
}
