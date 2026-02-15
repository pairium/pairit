import { Bird, Mail, Undo2 } from "lucide-react";
import type { HTMLAttributes } from "react";

const buttonBase =
	"inline-flex items-center gap-2 rounded-lg border border-transparent bg-black px-4 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900";

const ghostButton =
	"inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900";

export function Landing() {
	return (
		<div className="flex min-h-screen flex-col bg-slate-50 text-gray-900">
			<header className="border-b border-slate-200 bg-white/80 backdrop-blur">
				<div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
					<div className="flex items-center gap-2">
						<Bird size={24} />
						<div className="text-lg font-semibold tracking-tight">
							Pairit Lab
						</div>
					</div>
				</div>
			</header>

			<main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
				<section className="space-y-4">
					<h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
						Looking for an experiment?
					</h1>
					<p className="text-lg text-slate-600">
						You need a direct link to participate in a study.
					</p>
				</section>

				<div className="grid gap-6 md:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-lg">
								<Undo2 className="h-5 w-5 text-slate-500" />
								Go back
							</CardTitle>
							<CardDescription>
								Return to where you found the experiment link.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<p className="text-sm text-slate-600">
								Check your email, chat, or instruction sheet for the correct
								link to your study.
							</p>
							<button
								type="button"
								className={ghostButton}
								onClick={() => {
									window.history.back();
								}}
							>
								<Undo2 className="h-4 w-4" /> Go back
							</button>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-lg">
								<Mail className="h-5 w-5 text-slate-500" />
								Contact the researcher
							</CardTitle>
							<CardDescription>
								Having trouble? Reach out for help.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<p className="text-sm text-slate-600">
								If you can't find your experiment link, contact the researcher
								who invited you.
							</p>
							<a className={buttonBase} href="mailto:pairit@pairium.ai">
								<Mail className="h-4 w-4" /> Email support
							</a>
						</CardContent>
					</Card>
				</div>
			</main>

			<footer className="border-t border-slate-200 bg-white/60 py-6">
				<div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-2 px-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
					<span>Pairit Lab · experimental tooling in progress</span>
					<span>Need something else? Reply to your experiment invitation.</span>
				</div>
			</footer>
		</div>
	);
}

type CardProps = HTMLAttributes<HTMLDivElement>;

function Card({ className, ...props }: CardProps) {
	return (
		<div
			className={`rounded-3xl border border-slate-200 bg-white p-6 shadow-sm ${className ?? ""}`}
			{...props}
		/>
	);
}

const CardHeader = ({ className, ...props }: CardProps) => (
	<div className={`space-y-1.5 ${className ?? ""}`} {...props} />
);

const CardTitle = ({ className, ...props }: CardProps) => (
	<h2
		className={`text-xl font-semibold tracking-tight ${className ?? ""}`}
		{...props}
	/>
);

const CardDescription = ({ className, ...props }: CardProps) => (
	<p className={`text-sm text-slate-600 ${className ?? ""}`} {...props} />
);

const CardContent = ({ className, ...props }: CardProps) => (
	<div className={`pt-2 ${className ?? ""}`} {...props} />
);
