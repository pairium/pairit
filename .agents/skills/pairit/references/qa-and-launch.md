# Build, Incentive Check, QA & Pre-Launch Reference

## 1. Incentive & Anti-Gaming Audit

Before freezing a study with performance bonuses or optional skipping/delegation, check three failure modes:

1. **Speedup gaming (effective hourly wage loophole):**
   - In fixed-batch rounds ("finish 8 items to advance"), allowing auto-approve or rubber-stamping lets a participant finish the whole study in 2 minutes and collect full base pay.
   - **Fix:** Use **fixed-time rounds** (e.g., 60s each) whenever participants can skip or auto-approve, so everyone spends identical time regardless of effort.
2. **Per-round floor gambling:**
   - Flooring bonus pay at `$0.00` *per round* creates a free call option: a zero-effort participant can blast maximum throughput every round, write off bad rounds at `$0`, and pocket lucky zero-error rounds.
   - **Fix:** Floor bonus pay at the **study level** (`totalBonus = max(0, rawTotalBonus)`), showing signed per-round net pay (`+$0.80` / `-$0.40`) while keeping cumulative bonus floored at `$0.00`.
3. **Rare-event variance asymmetry:**
   - Even with identical raw expected value across arms, a rare-severe arm (`10%` error, big penalty) has higher variance than a frequent-mild arm (`40%` error, small penalty) and therefore higher option value under a `$0` floor.
   - **Fix:** Run a quick Monte Carlo simulation (100k runs) of pure zero-effort / all-auto strategies across every arm and verify `E[floored bonus]` is negligible (e.g., `< $0.05`) in every arm while careful performance remains attractive.

## 2. Reproducible Build Script (`build.py`)

For studies with an `html` embed (especially with injected stimulus banks), provide a single build script that:
1. Injects stimulus/config data into the template to emit `renderers/<name>.html`.
2. Asserts the compiled HTML is `< 1 MB` (Pairit upload limit).
3. Extracts inline `<script>` blocks and runs `node --check` to catch JS syntax errors immediately.
4. Runs `pairit config lint experiment.yaml` and `pairit config compile experiment.yaml --out experiment.json`.

## 3. QA Iteration Workflow

1. **Upload under a dedicated QA name** (`--name <study>-qa`) so test sessions never mix with production data.
2. **Allow retakes temporarily during QA:**
   - Set `allowRetake: true  # TODO(pre-launch): set back to false before Prolific pilot/launch` in `experiment.yaml` and track it in the study's `README.md`.
   - Remember: a browser tab with an *in-progress* session still resumes its started revision even with `allowRetake: true`. Always hand the researcher a fresh Prolific-style QA link when pushing a new revision:
     ```text
     https://pairit.pairium.ai/<qa-config-id>?PROLIFIC_PID=qa_v<rev>_1&STUDY_ID=qa&SESSION_ID=s<rev>_1
     ```
     (Prolific parameters skip Google sign-in and isolate each `PROLIFIC_PID` as a distinct participant.)

## 4. Automated Playwright Verification (Local + Live)

Before handing a build to the researcher or launching, run Playwright both locally (fast full-session sweep) and against the live QA URL:

- **Full-path coverage:** Drive every randomized arm, branch, validation bounce (e.g., out-of-range input), opt-out path, and optional-blank survey submission to an `end: true` page.
- **Zero runtime errors:** Assert `0` `console.error`, `0` `pageerror`, and `0` failed network requests (`status >= 400`).
- **Visual & geometry verification:**
  - Capture screenshots of key states (Practice cues, active task at both min and max item counts such as `N = 1` and `N = 8`/`20`, native summary/choice pages).
  - Assert no unwanted vertical stacking of left/right panels and `scrollHeight === clientHeight` (no inner iframe scrollbars or clipped cards) at Pairit's actual iframe width (`~942px` for `width: wide`, `~684px` default).
- **Schema check:** Validate the persisted `session_state` payload against `state.schema.json` (or assert every key required by the analysis pipeline is present and typed correctly).
- **Multiplayer / concurrency (if applicable):** Launch `N` browser contexts simultaneously with distinct `PROLIFIC_PID=bot_qa_<n>` values, submit/chat concurrently, and wait for every participant to reach an `end: true` page.

## 5. Data Audit & Dry-Run Analysis

After a live QA Playwright sweep, verify the exported data end-to-end:

```bash
pairit data audit <qa-config-id> \
  --pid-prefix bot_qa_ \
  --since <ISO-start-time> \
  --config experiment.yaml \
  --require-state <comma-separated-keys>

pairit data export <qa-config-id> --format json --out qa_export/
```

Run your actual analysis script on `qa_export/` before paying participants so missing fields, type mismatches, or parsing bugs show up on bot data instead of live Prolific data.

## 6. Pre-Launch Checklist

Verify every box before launching on Prolific:
- [ ] `allowRetake: false` in `experiment.yaml` (remove QA `# TODO(pre-launch)`).
- [ ] Real IRB approval/application number stamped in consent footer (no `PENDING_*`).
- [ ] Real Prolific completion code in `endRedirectUrl` (no `REPLACE_WITH_*`).
- [ ] Consent, pay math, telemetry disclosures, and optional survey rules match the approved IRB packet verbatim.
- [ ] Uploaded under a **fresh production `--name`** (never reuse the `-qa` config ID).
- [ ] One final live smoke click-through (or `pairit data audit` on a clean pilot) passes with `0` errors.
