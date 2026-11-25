---
name: pairit
description: >-
  Build, redesign, review, and QA-test behavioral science experiments on Pairit
  (experiment.yaml configs, native pages, and custom HTML embeds). Use when
  creating or polishing a Pairit study, simplifying participant onboarding and
  instructions, fixing iframe layout or panel-ception, checking incentive
  anti-gaming rules, or running Playwright and pairit data audit pre-launch checks.
---

# Pairit Experiment Builder

Build participant-ready Pairit studies (`schema_version: 0.1.0`) that are effortless to understand on the first click, native-first in architecture, visually clean inside embeds, incentive-compatible, and verified end-to-end before launch.

Paths like `references/...` are relative to this skill's directory (the folder holding this `SKILL.md`). Read the linked reference file before editing that layer.

## 1. Core Design Philosophy

- **Show, don't essay.** Once the core study spec is clear, build and upload a live QA copy (`--name <study>-qa`) early so the researcher can click through it directly.
- **Zero friction, zero clutter.** Every screen should have one clear job, plain-English copy, and zero unexplained labels, insider jargon, or dead controls.
- **Step-by-step guidance.** Teach every UI mechanic hands-on before Round 1. Never introduce a new button, toggle, or selection interaction for the first time inside a scored round.
- **Native first, `html` only for custom interaction.** Put Consent, Overview, Rules, Choice inputs, Round Summaries, Wrap-up Surveys, and Debrief in native Pairit `text`, `buttons`, and `survey` pages. Put only live interactive tasks inside `html` embeds.

## 2. Participant UX & Copy Rules

Read [references/ux-and-copy.md](references/ux-and-copy.md) for templates and concrete before/after examples. Enforce all of the following on every study:

1. **Compact 1-screen Consent + clean footer:**
   - Summarize the task, duration, pay/bonus rules, voluntariness, and privacy in 2–3 short bullets. Never stack multi-screen disclaimer walls, tours, quizzes, and second welcome screens.
   - Provide explicit agree and decline buttons (routing decline to an `end: true` opt-out page that records no task data).
   - Place institutional affiliation, PI name/email, and IRB contact/application number in a **single italicized footer below a `---` divider underneath the consent buttons** — not cluttering the top of the page. (If `~/.config/agent-lab/irb-profile.md` exists locally, read PI/IRB boilerplate from it; otherwise use placeholders.)
2. **Real-world story before the first task:**
   - Open with a brief role overview explaining *what* the participant does, *why* any agent/wait exists, and *what* each action button actually does. Use concrete action verbs (`Approve Analysis`, `Send Email`, `Approve Refund`), not vague generic labels.
3. **Zero filler text, jargon, or weird formatting:**
   - Strip contextless chrome and IDs (`PO-1001`, `ORIGINAL RECORD`, `VERIFIED SOURCE`, `AGENT EXTRACTION`, `Sample Agent`, `Compare left → right`).
   - Say **"bonus pay"** (never bare `"bonus"`).
   - Replace researcher jargon (`"block bonus"`, `"choice 1"`, `"5 numbers of agents"`) with plain English.
   - Avoid inline code backticks in participant Markdown prose.
4. **Hands-on Practice that mirrors real rounds:**
   - Practice every real-round interaction (including multi-card selection and any optional toggles) with explicit visual cues: pulsing rings, pointer arrows (`← Click here`, `← Click to open`), and red error highlights on a miss.
   - Give each Practice confirmation (*"Correct! ..."*) its own dedicated screen with a **Next** button so feedback never swallows the next prompt.
   - Give every control a self-explanatory label (`Auto-approve: OFF / ON`, `Unchecked` instead of ambiguous `Auto`) and an interactive preview before Round 1.
   - Match visual form to the mental model (e.g., render an email draft as one cohesive email sheet with hover-to-flag lines, not disconnected choice buttons).
5. **State bounds and stakes upfront; cut fake choices:**
   - State input ranges upfront (*"Enter a whole number from 1 to 20"*), headline bonus upside (*"up to $X+ in bonus pay"*), and exact per-item gain/loss stakes.
   - Remove unnecessary buttons, toggles, or gimmicks that clutter the UI or fail silently in iframes (e.g., Web Audio chimes blocked by browser autoplay).
   - Cut hostage timers and redundant unpaid calibration/warmup blocks when a fixed exogenous grid (`1, 2, 4, 8`) already brackets the range cleanly.

## 3. Pairit Architecture & Layout Rules

Read [references/pairit-patterns.md](references/pairit-patterns.md) for YAML snippets, CSS resets, and CLI flags.

- **Use native pages everywhere possible:** Branch and personalize native pages with `onEnter` (`balanced_random`), atomic `when:` expressions, `{{session_state.*}}`, and `action.branches`.
- **Keep `when:` expressions atomic:** Use single comparisons (`session_state.error_rate == 'high'`). Do not rely on compound `and` / `or` / parenthesized expressions.
- **Kill "panel-ception" on `html` pages:**
  - Set `width: wide` on interactive pages (expands card from `max-w-3xl` to `max-w-5xl`, ~942px inner width) and `borderless: true` on the `html` component (default `height: auto` tracks content via `ResizeObserver`).
  - Inside the embed CSS: white `#fff` `body`, zero outer padding/margin, `html, body { height: auto; }`, and no outer `.card` wrapper duplicating Pairit's page card.
- **Direct navigation via `html.props.action`:** Call `pairit.setState(...)` *before* `pairit.done()`, and configure `html.props.action: { type: go_to, target: ... }`. Never leave a disabled `"Continue"` or `"See Summary"` button sitting beneath an `html` embed while the participant works, and never toggle a `buttons` component via `when:` on the same page as an `html` embed.
- **Stable, scroll-free embed layouts:**
  - Set side-by-side breakpoints below Pairit's actual iframe width (`~660px` default, `~942px` wide) so `"on the left / on the right"` never stacks vertically.
  - Keep card widths fixed across item counts (e.g., a fixed 4-column grid for `N = 1, 2, 4, 8, 20` — never stretch a single card to full width).
  - Avoid clipped inner scrollboxes (`max-height` + `overflow-y: auto`) that snap back to top on re-render; let `height: auto` grow cleanly.
- **Always author `end: true` pages properly:** Pairit renders `end: true` page components directly (with `endRedirectUrl` below a divider). Put clean debrief or opt-out copy on every `end: true` page.

## 4. Incentive & Survey Hygiene

- **Audit for speeder & floor-gambling loopholes:**
  - If participants can skip or auto-approve items, use **fixed-time rounds** (not fixed-batch rounds) so skipping never lets speeders finish early for full base pay.
  - Floor bonus pay at the **study level** (`max(0, total)`), not per round, so zero-effort participants cannot gamble on lucky streaks.
  - Simulate zero-effort / all-auto strategies (e.g., 100k runs) to verify expected bonus is near `$0` in every treatment arm.
- **Optional wrap-up surveys:** Keep post-study surveys short (e.g., 3 items), mark items `required: false`, state explicitly that participants may leave any blank, and include a no-PII reminder on open-text fields.

## 5. Build, QA & Pre-Launch Workflow

Read [references/qa-and-launch.md](references/qa-and-launch.md) for the full Playwright, `pairit data audit`, and launch checklist.

1. **Build & lint locally:** Verify each embed is `< 1 MB`, syntax-check embedded JS with `node --check`, and run `pairit config lint` + `pairit config compile`.
2. **Upload a QA copy:** Use `pairit config upload --name <study>-qa <experiment.yaml>`. During iteration, temporarily set `allowRetake: true` with `# TODO(pre-launch)` and test via fresh `?PROLIFIC_PID=qa_vN&STUDY_ID=qa&SESSION_ID=sN` URLs (bump `N` per revision so browsers do not resume stale sessions).
3. **Run automated Playwright checks (local + live):**
   - Drive every condition and branch end-to-end with `0` console errors and `0` failed network requests.
   - Inspect rendered geometry at exact Pairit iframe dimensions (including max-item states like `N = 8` / `N = 20`) to verify `scrollHeight === clientHeight` and zero clipping or unexpected vertical stacking.
   - Validate saved `session_state` against a JSON Schema (and verify optional survey blanks succeed).
4. **Audit & export QA data:** Run `pairit data audit <qaConfigId> --pid-prefix <prefix> --since <ISO> --config <yaml> --require-state <keys>` and test your analysis script on `pairit data export`.
5. **Pre-launch freeze:** Flip `allowRetake: false`, replace IRB & Prolific code placeholders, and upload under a **fresh production `--name`** (never reuse the QA config ID).

## Never

- Put institutional PI/IRB boilerplate at the top of the consent page when it belongs in a clean italicized footer below the buttons.
- Leave filler IDs, internal jargon, bare `"Bonus"`, or unexplained controls anywhere participants can see them.
- Stuff static text, choice forms, or summaries into an `html` iframe when Pairit's native `text`, `buttons`, and `survey` components handle them cleanly.
- Stack gray backgrounds and bordered `.card` wrappers inside an `html` embed or leave a disabled `"Next"` button beneath an active embed.
- Introduce a real-round UI interaction (card switching, toggles, shortcuts) without teaching it hands-on during Practice.
- Ship to Prolific without flipping `allowRetake: false`, replacing placeholders, auditing test exports, and uploading under a fresh production `--name`.
