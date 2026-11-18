import { describe, expect, test } from "vitest";
import { DIAGRAM_CSP, toMermaidFrame } from "./mermaid-frame";

function toBase64(text: string) {
	const bytes = new TextEncoder().encode(text);
	return btoa(Array.from(bytes, (b) => String.fromCodePoint(b)).join(""));
}

// What mermaid.render returns with securityLevel "sandbox"
function mermaidOutput(body: string, height = "120px") {
	return `<iframe style="width:100%;height:${height};border:0;margin:0;" src="data:text/html;charset=UTF-8;base64,${toBase64(body)}" sandbox="allow-top-navigation-by-user-activation allow-popups">
  The "iframe" tag is not supported by your browser.
</iframe>`;
}

describe("toMermaidFrame", () => {
	test("puts the diagram behind a CSP that blocks network requests", () => {
		const frame = toMermaidFrame(
			mermaidOutput('<body style="margin:0"><svg>ü</svg></body>', "120.5px"),
		);
		expect(frame?.height).toBe(121);
		expect(
			frame?.srcdoc.startsWith(
				`<!DOCTYPE html><meta http-equiv="Content-Security-Policy" content="${DIAGRAM_CSP}">`,
			),
		).toBe(true);
		expect(frame?.srcdoc).toContain("<svg>ü</svg>");
		expect(DIAGRAM_CSP).toContain("default-src 'none'");
	});

	test("refuses anything that isn't mermaid's sandboxed iframe", () => {
		expect(toMermaidFrame("<svg onload=alert(1)></svg>")).toBeNull();
		expect(toMermaidFrame('<img src="x">')).toBeNull();
	});
});
