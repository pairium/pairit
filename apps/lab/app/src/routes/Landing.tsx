import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
	Bird,
	Bot,
	CheckCircle2,
	CircuitBoard,
	Dices,
	FlaskConical,
	Mail,
	MessageCircle,
	Undo2,
	Users,
} from "lucide-react";
import type { HTMLAttributes } from "react";

const buttonBase =
	"inline-flex items-center gap-2 rounded-lg border border-transparent bg-black px-4 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900";

const ghostButton =
	"inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900";

type DemoConfig = {
	id: string;
	title: string;
	description: string;
	icon: LucideIcon;
	disabled?: boolean;
};

const sampleConfigs: DemoConfig[] = [
	{
		id: "hello-world",
		title: "Hello world",
		description: "One question, one button, data in MongoDB.",
		icon: CheckCircle2,
	},
	{
		id: "survey-showcase",
		title: "Survey",
		description: "Q&A, branching, media, and Prolific redirect.",
		icon: FlaskConical,
	},
	{
		id: "randomization-demo",
		title: "Randomization",
		description: "Random, balanced, and block assignment.",
		icon: Dices,
	},
	{
		id: "ai-chat",
		title: "AI chat",
		description: "Negotiate with an AI agent via streaming chat.",
		icon: MessageCircle,
	},
	{
		id: "team-decision",
		title: "Team decision",
		description: "2-person matchmaking and group chat.",
		icon: Users,
	},
	{
		id: "ai-mediation",
		title: "AI mediation",
		description: "2-person chat with AI facilitator. Open in 2 tabs.",
		icon: Bot,
	},
];

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
						You found the Pairit Lab staging room.
					</h1>
				</section>

				<div className="grid gap-6 md:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-lg">
								<Undo2 className="h-5 w-5 text-slate-500" />
								Just passing through?
							</CardTitle>
							<CardDescription>
								You might have opened a link meant for an ongoing study.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<p className="text-sm text-slate-600">
								Return to the place you started—your email, chat, or instruction
								sheet—then follow the original directions again.
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
								<FlaskConical className="h-5 w-5 text-slate-500" />
								Running an experiment?
							</CardTitle>
							<CardDescription>Browse the demos below.</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<p className="text-sm text-slate-600">
								Find out more about Pairit for your research. Pairit is a
								platform for creating and running experiments with humans and
								AI.
							</p>
							<div className="flex gap-3">
								<a
									href={import.meta.env.VITE_MANAGER_URL}
									target="_blank"
									rel="noopener noreferrer"
									className={ghostButton}
								>
									<CircuitBoard className="h-4 w-4" /> Manager
								</a>
							</div>
						</CardContent>
					</Card>
				</div>

				<section className="space-y-4">
					<h2 className="text-2xl font-semibold tracking-tight text-slate-900">
						Sample configurations
					</h2>
					<p className="text-sm text-slate-600">
						Browse demo experiments. Visit <code>/$experimentId</code> to test.
					</p>
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
						{sampleConfigs.map(
							({ id, title, description, icon: IconComp, disabled }) => (
								<Card key={id} className="flex h-full flex-col justify-between">
									<CardHeader className="space-y-2">
										<CardTitle className="flex items-center gap-2 text-base">
											<IconComp className="h-4 w-4 text-slate-500" />
											{title}
										</CardTitle>
										<CardDescription className="text-xs">
											{description}{" "}
											<a
												href={`/configs/${id}.yaml`}
												target="_blank"
												rel="noopener noreferrer"
												className="text-slate-400 underline hover:text-slate-600"
											>
												View config ↗
											</a>
										</CardDescription>
									</CardHeader>
									<CardContent>
										{disabled ? (
											<span
												className={`${ghostButton} w-full justify-center cursor-not-allowed opacity-50`}
											>
												Coming soon
											</span>
										) : (
											<Link
												to="/$experimentId"
												params={{ experimentId: id }}
												className={`${ghostButton} w-full justify-center`}
											>
												Open
											</Link>
										)}
									</CardContent>
								</Card>
							),
						)}
					</div>
				</section>

				<section className="space-y-4">
					<h2 className="text-2xl font-semibold tracking-tight text-slate-900">
						Need a human?
					</h2>
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-lg">
								<Mail className="h-5 w-5 text-slate-500" /> Email the lab
							</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<p className="text-sm text-slate-600">
								Reach the experiment coordinator for help.
							</p>
							<a className={buttonBase} href="mailto:pairit@pairium.ai">
								<Mail className="h-4 w-4" /> Email pairit@pairium.ai
							</a>
						</CardContent>
					</Card>
				</section>
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
