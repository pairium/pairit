/**
 * With securityLevel "sandbox", mermaid.render returns an <iframe> whose
 * diagram is a base64 data: URL. The lab draws its own iframe from that
 * diagram instead of inserting mermaid's HTML: srcdoc, no sandbox
 * permissions at all, and a CSP that blocks every network request (e.g. a
 * url(...) in diagram styles).
 */

export const DIAGRAM_CSP =
	"default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";

const DEFAULT_HEIGHT = 400;

export type MermaidFrame = { srcdoc: string; height: number };

export function toMermaidFrame(rendered: string): MermaidFrame | null {
	const src = rendered.match(
		/\ssrc="data:text\/html;charset=UTF-8;base64,([^"]*)"/,
	);
	if (!src) return null;
	let html: string;
	try {
		const bytes = Uint8Array.from(atob(src[1]), (ch) => ch.charCodeAt(0));
		html = new TextDecoder().decode(bytes);
	} catch {
		return null;
	}
	const height = rendered.match(/height:\s*([\d.]+)px/);
	return {
		srcdoc: `<!DOCTYPE html><meta http-equiv="Content-Security-Policy" content="${DIAGRAM_CSP}"><style>body{display:flex;justify-content:center}</style>${html}`,
		height: height ? Math.ceil(Number(height[1])) : DEFAULT_HEIGHT,
	};
}
