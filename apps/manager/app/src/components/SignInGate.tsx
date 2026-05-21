import { useSession } from "@app/lib/auth-client";
import { Button } from "@components/ui/Button";
import { Card, CardContent } from "@components/ui/Card";
import type { ReactNode } from "react";

async function startGoogleSignIn() {
	const origin = window.location.origin;
	const res = await fetch(`${origin}/api/auth/sign-in/social`, {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			provider: "google",
			callbackURL: origin,
		}),
	});
	const data = (await res.json()) as { url?: string };
	if (data.url) {
		window.location.href = data.url;
	} else {
		alert(`Sign-in error: ${JSON.stringify(data)}`);
	}
}

export function SignInGate({ children }: { children: ReactNode }) {
	const { data: session, isPending } = useSession();

	if (isPending) {
		return (
			<div className="flex items-center justify-center min-h-screen text-slate-500 text-sm">
				Loading…
			</div>
		);
	}

	if (!session?.user) {
		return (
			<div className="flex items-center justify-center min-h-screen px-4">
				<Card className="max-w-md w-full">
					<CardContent className="space-y-5">
						<div>
							<h1 className="text-2xl font-semibold tracking-tight text-slate-900">
								Sign in
							</h1>
							<p className="text-sm text-slate-600 mt-2">
								Pairit Manager is invite-only. Sign in with your allowlisted
								Google account to continue.
							</p>
						</div>
						<Button onClick={startGoogleSignIn} className="w-full">
							Continue with Google
						</Button>
						<p className="text-xs text-slate-500">
							Not on the allowlist? Ask your operator for an invite.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	return <>{children}</>;
}
