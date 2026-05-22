import { useSession } from "@app/lib/auth-client";
import { Button } from "@components/ui/Button";
import { Card, CardContent } from "@components/ui/Card";
import { type ReactNode, useEffect, useState } from "react";

const CONTACT_EMAIL = import.meta.env.VITE_MANAGER_CONTACT_EMAIL ?? "";

async function startGoogleSignIn() {
	const origin = window.location.origin;
	const res = await fetch(`${origin}/api/auth/sign-in/social`, {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			provider: "google",
			callbackURL: origin,
			errorCallbackURL: `${origin}/?denied=1`,
		}),
	});
	const data = (await res.json()) as { url?: string };
	if (data.url) {
		window.location.href = data.url;
	} else {
		alert(`Sign-in error: ${JSON.stringify(data)}`);
	}
}

function clearDeniedParam() {
	const url = new URL(window.location.href);
	url.searchParams.delete("denied");
	url.searchParams.delete("error");
	window.history.replaceState({}, "", url.toString());
}

export function SignInGate({ children }: { children: ReactNode }) {
	const { data: session, isPending } = useSession();
	const [denied, setDenied] = useState(
		() =>
			typeof window !== "undefined" &&
			new URLSearchParams(window.location.search).get("denied") === "1",
	);

	useEffect(() => {
		if (denied && session?.user) {
			setDenied(false);
			clearDeniedParam();
		}
	}, [denied, session?.user]);

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
						{denied ? (
							<>
								<div>
									<h1 className="text-2xl font-semibold tracking-tight text-slate-900">
										Access denied
									</h1>
									<p className="text-sm text-slate-600 mt-2">
										Pairit Manager is invite-only. Your Google account isn't on
										the allowlist for this instance.
									</p>
								</div>
								{CONTACT_EMAIL && (
									<Button
										onClick={() => {
											window.location.href = `mailto:${CONTACT_EMAIL}`;
										}}
										className="w-full"
									>
										Request access
									</Button>
								)}
								<Button
									variant="ghost"
									onClick={() => {
										setDenied(false);
										clearDeniedParam();
									}}
									className="w-full"
								>
									Try a different account
								</Button>
								{CONTACT_EMAIL && (
									<p className="text-xs text-slate-500">
										Contact{" "}
										<a
											href={`mailto:${CONTACT_EMAIL}`}
											className="text-slate-700 underline"
										>
											{CONTACT_EMAIL}
										</a>
										.
									</p>
								)}
							</>
						) : (
							<>
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
								{CONTACT_EMAIL ? (
									<p className="text-xs text-slate-500">
										Not on the allowlist?{" "}
										<a
											href={`mailto:${CONTACT_EMAIL}`}
											className="text-slate-700 underline"
										>
											Request access
										</a>
										.
									</p>
								) : (
									<p className="text-xs text-slate-500">
										Not on the allowlist? Ask your operator for an invite.
									</p>
								)}
							</>
						)}
					</CardContent>
				</Card>
			</div>
		);
	}

	return <>{children}</>;
}
