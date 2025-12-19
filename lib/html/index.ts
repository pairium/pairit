export interface PageOptions {
    title: string;
    content: string;
    scripts?: string;
}

export function renderPage({ title, content, scripts = '' }: PageOptions) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --slate-50: #f8fafc;
            --slate-100: #f1f5f9;
            --slate-200: #e2e8f0;
            --slate-600: #475569;
            --slate-900: #0f172a;
            --blue-600: #2563eb;
            --blue-700: #1d4ed8;
            --emerald-600: #059669;
            --red-600: #dc2626;
            --red-50: #fef2f2;
        }
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Inter', -apple-system, system-ui, sans-serif;
            background-color: var(--slate-50);
            color: var(--slate-900);
            line-height: 1.5;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .header {
            background: rgba(255, 255, 255, 0.8);
            backdrop-filter: blur(8px);
            border-bottom: 1px solid var(--slate-200);
            padding: 1rem 1.5rem;
            position: sticky;
            top: 0;
            z-index: 10;
        }

        .header-content {
            max-width: 1024px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .logo {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-weight: 700;
            font-size: 1.25rem;
            color: var(--slate-900);
            text-decoration: none;
        }

        .container {
            max-width: 1024px;
            margin: 0 auto;
            padding: 4rem 1.5rem;
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            width: 100%;
        }

        .hero {
            margin-bottom: 3rem;
        }

        h1 {
            font-size: 2.5rem;
            font-weight: 700;
            letter-spacing: -0.025em;
            margin-bottom: 1rem;
            color: var(--slate-900);
        }

        .subtitle {
            font-size: 1.125rem;
            color: var(--slate-600);
            max-width: 600px;
            margin: 0 auto;
        }

        .card {
            background: white;
            border: 1px solid var(--slate-200);
            border-radius: 1.5rem;
            padding: 3rem;
            transition: all 0.2s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            max-width: 450px;
            width: 100%;
            margin: 0 auto;
        }

        .card:hover {
            border-color: var(--slate-200);
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            transform: translateY(-2px);
        }

        .card h2 {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .card p {
            color: var(--slate-600);
            font-size: 1rem;
            margin-bottom: 2.5rem;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            padding: 0.75rem 1.5rem;
            border-radius: 0.75rem;
            font-weight: 600;
            font-size: 1rem;
            text-decoration: none;
            transition: all 0.2s;
            cursor: pointer;
            border: none;
            width: 100%;
        }

        .btn:disabled {
            opacity: 0.7;
            cursor: not-allowed;
            background-color: var(--slate-600);
        }

        .btn-primary {
            background-color: var(--slate-900);
            color: white;
        }

        .btn-primary:hover:not(:disabled) {
            background-color: #1e293b;
        }

        .btn-blue {
            background-color: var(--blue-600);
            color: white;
        }

        .btn-blue:hover:not(:disabled) {
            background-color: var(--blue-700);
        }

        .token-box {
            background: var(--slate-100);
            color: var(--slate-900);
            padding: 1rem;
            border-radius: 0.5rem;
            font-family: monospace;
            word-break: break-all;
            margin-bottom: 1.5rem;
            border: 1px solid var(--slate-200);
            font-size: 0.875rem;
            width: 100%;
        }

        .token-box.error {
            background: var(--red-50);
            color: var(--red-600);
            border-color: var(--red-600);
        }

        .footer {
            border-top: 1px solid var(--slate-200);
            padding: 1.5rem;
            background: white;
            margin-top: auto;
        }

        .footer-content {
            max-width: 1024px;
            margin: 0 auto;
            font-size: 0.75rem;
            color: var(--slate-600);
            display: flex;
            justify-content: space-between;
        }

        .icon {
            width: 24px;
            height: 24px;
            stroke: currentColor;
            stroke-width: 2;
            fill: none;
        }
        
        a { color: var(--blue-600); text-decoration: none; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <header class="header">
        <div class="header-content">
            <a href="/" class="logo">
                <svg class="icon" viewBox="0 0 24 24"><path d="M16 8l2 -2m0 0l-12 0m12 0l0 12m-2 -2l-2 2"></path><circle cx="12" cy="12" r="9"></circle></svg>
                Pairit Manager
            </a>
        </div>
    </header>

    <main class="container">
        ${content}
    </main>

    <footer class="footer">
        <div class="footer-content">
            <span>Pairit Manager · Management Console</span>
            <span>&copy; 2025 Pairium AI</span>
        </div>
    </footer>
    ${scripts}
</body>
</html>`;
}

/**
 * Renders a specialized success page for the CLI loopback flow.
 * Centers the content and includes auto-close logic.
 */
export function renderCliSuccessPage() {
    const content = `
    <div class="card">
        <h1>
            <svg class="icon" style="color: var(--emerald-600); width: 32px; height: 32px;" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Authenticated!
        </h1>
        <p>You have successfully logged in. You can now close this window and return to your CLI.</p>
        <button onclick="window.close()" class="btn btn-blue">Close Window</button>
    </div>`;

    const scripts = `
    <script>
        // Auto-close after 3 seconds if supported
        setTimeout(() => {
            window.close();
        }, 3000);
    </script>`;

    return renderPage({
        title: "Login Successful",
        content,
        scripts
    });
}
