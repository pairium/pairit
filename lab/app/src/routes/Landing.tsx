import type { HTMLAttributes } from 'react'
import { Link } from '@tanstack/react-router'
import { Bird, CircuitBoard, FlaskConical, Mail, Undo2 } from 'lucide-react'

const buttonBase =
  'inline-flex items-center gap-2 rounded-lg border border-transparent bg-black px-4 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900'

const ghostButton =
  'inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900'

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-gray-900">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Bird size={24} />
            <div className="text-lg font-semibold tracking-tight">Pairit Lab</div>
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
                Return to the place you started—your email, chat, or instruction sheet—then follow the original directions again.
              </p>
              <button
                type="button"
                className={ghostButton}
                onClick={() => {
                  window.history.back()
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
              <CardDescription>
                Check out a Pairit demo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">
                Find out more about Pairit for your research. Pairit is a platform for creating and running experiments with humans and AI.
              </p>
              <div className="flex gap-3">
                <Link
                  to="/$experimentId"
                  params={{ experimentId: 'survey-showcase' }}
                  className={buttonBase}
                >
                  <FlaskConical className="h-4 w-4" /> Survey showcase
                </Link>
                <a
                  href="https://console.firebase.google.com/project/pairit-lab/overview"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ghostButton}
                >
                  <CircuitBoard className="h-4 w-4" /> Pairit
                </a>
              </div>
            </CardContent>
          </Card>
        </div>

        <section>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mail className="h-5 w-5 text-slate-500" /> Need a human?
              </CardTitle>
              <CardDescription>
                Reach the experiment coordinator for help or debrief.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                Send a quick note describing how you arrived and what you expected to find.
              </p>
              <a className={buttonBase} href="mailto:lab@pairit.test">
                <Mail className="h-4 w-4" /> Email lab@pairit.test
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
  )
}

type CardProps = HTMLAttributes<HTMLDivElement>

function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={`rounded-3xl border border-slate-200 bg-white p-6 shadow-sm ${className ?? ''}`}
      {...props}
    />
  )
}

const CardHeader = ({ className, ...props }: CardProps) => (
  <div className={`space-y-1.5 ${className ?? ''}`} {...props} />
)

const CardTitle = ({ className, ...props }: CardProps) => (
  <h2 className={`text-xl font-semibold tracking-tight ${className ?? ''}`} {...props} />
)

const CardDescription = ({ className, ...props }: CardProps) => (
  <p className={`text-sm text-slate-600 ${className ?? ''}`} {...props} />
)

const CardContent = ({ className, ...props }: CardProps) => (
  <div className={`pt-2 ${className ?? ''}`} {...props} />
)


