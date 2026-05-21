export interface PageOptions {
	title: string;
	content: string;
	scripts?: string;
}

const GLOBAL_CSS = `
:root {
    --slate-50: #f8fafc;
    --slate-100: #f1f5f9;
    --slate-200: #e2e8f0;
    --slate-300: #cbd5e1;
    --slate-500: #64748b;
    --slate-600: #475569;
    --slate-700: #334155;
    --slate-900: #0f172a;
    --red-50: #fef2f2;
    --red-600: #dc2626;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body { background: var(--slate-50); }

body {
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
        "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: var(--slate-900);
    font-size: 15px;
    line-height: 1.55;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

a { color: var(--slate-900); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--slate-300); }
a:hover { text-decoration-color: var(--slate-900); }

.shell {
    min-height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr auto;
}

.header, .footer {
    padding: 1rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
}

.header {
    border-bottom: 1px solid var(--slate-200);
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(8px);
}

.brand {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    color: var(--slate-900);
    font-weight: 600;
    font-size: 0.95rem;
    text-decoration: none;
}
.brand-mark {
    width: 18px; height: 18px;
    stroke: currentColor; stroke-width: 1.8;
    stroke-linecap: round; stroke-linejoin: round;
    fill: none;
}

.tag {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.02em;
    color: var(--slate-500);
    padding: 0.25rem 0.55rem;
    border: 1px solid var(--slate-200);
    border-radius: 999px;
    background: white;
}

.footer {
    border-top: 1px solid var(--slate-200);
    font-size: 12px;
    color: var(--slate-500);
    background: white;
}
.footer a { color: var(--slate-500); text-decoration-color: var(--slate-300); }
.footer a:hover { color: var(--slate-900); }

.main {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3rem 1.5rem;
}

.card {
    width: 100%;
    max-width: 28rem;
    background: white;
    border: 1px solid var(--slate-200);
    border-radius: 1rem;
    padding: 2.25rem;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

h1 {
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: -0.015em;
    color: var(--slate-900);
    margin-bottom: 0.5rem;
}

.subtitle {
    color: var(--slate-600);
    font-size: 0.95rem;
    line-height: 1.55;
    margin-bottom: 1.75rem;
}

.actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    border: 1px solid var(--slate-200);
    border-radius: 0.625rem;
    color: var(--slate-900);
    text-decoration: none;
    background: white;
    transition: background 0.15s ease, border-color 0.15s ease;
}
.action:hover {
    background: var(--slate-50);
    border-color: var(--slate-300);
}
.action .label { font-size: 0.95rem; font-weight: 500; }
.action .arrow {
    color: var(--slate-500);
    transition: transform 0.15s ease, color 0.15s ease;
}
.action:hover .arrow { color: var(--slate-900); transform: translateX(2px); }

.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.625rem 1rem;
    font-size: 0.9rem;
    font-weight: 500;
    border-radius: 0.5rem;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    border: 1px solid transparent;
    font-family: inherit;
}
.btn--primary {
    background: var(--slate-900);
    color: white;
}
.btn--primary:hover { background: #1e293b; }
.btn--ghost {
    background: white;
    color: var(--slate-900);
    border-color: var(--slate-200);
}
.btn--ghost:hover { background: var(--slate-50); border-color: var(--slate-300); }
.btn[disabled] { opacity: 0.55; cursor: not-allowed; }

.btn-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.token {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Courier New", monospace;
    font-size: 0.85rem;
    word-break: break-all;
    padding: 0.875rem 1rem;
    background: var(--slate-50);
    border: 1px solid var(--slate-200);
    border-radius: 0.5rem;
    color: var(--slate-900);
    margin-bottom: 1rem;
}
.token.error { color: var(--red-600); border-color: var(--red-600); background: var(--red-50); }

.token-meta {
    font-size: 11px;
    color: var(--slate-500);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.5rem;
}

.footnote {
    color: var(--slate-500);
    font-size: 0.8rem;
    margin-top: 1.25rem;
}

.icon { width: 18px; height: 18px; stroke: currentColor; stroke-width: 2; fill: none; }
`;

function brandMarkSvg(): string {
	return `<svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3"/><path d="M14 17.75V21"/><path d="M7 18a6 6 0 0 0 3.84-10.61"/></svg>`;
}

export function renderPage({ title, content, scripts = "" }: PageOptions) {
	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} — Pairit Manager</title>
    <style>${GLOBAL_CSS}</style>
</head>
<body>
    <div class="shell">
        <header class="header">
            <a href="/" class="brand">
                ${brandMarkSvg()}
                <span>Pairit Manager</span>
            </a>
            <span class="tag">Invite-only</span>
        </header>

        <main class="main">
            <div class="card">
                ${content}
            </div>
        </main>

        <footer class="footer">
            <span>Pairit Manager</span>
            <span>&copy; Pairium AI</span>
        </footer>
    </div>
    ${scripts}
</body>
</html>`;
}
