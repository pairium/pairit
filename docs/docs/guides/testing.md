# Test a Study Before Launch

Clicking through your study in one browser tab misses the bugs that break real runs: two participants submitting at the same moment, an optional question that blocks the Next button, a group where one person gets stuck in the lobby, or an answer that never saves. Run a group of simulated participants through the study, then check the data with `pairit data audit`.

## 1. Upload a test copy

Upload the config under a separate name, so test sessions get their own link and never mix with real data:

```bash
pairit config upload study.yaml --name my-study-qa
```

Upload prints the link, e.g. `https://pairit.pairium.ai/my-study-qa-k3f9x2m8q1`. The last part of the link is the config ID (`my-study-qa-k3f9x2m8q1`); the commands below use it. When the test passes, upload the same file under the real name.

## 2. Run simulated participants

Each Prolific ID is a separate participant, and Prolific participants skip sign-in. Open one browser per participant:

```
https://pairit.pairium.ai/my-study-qa-k3f9x2m8q1?PROLIFIC_PID=bot_qa_1&STUDY_ID=qa&SESSION_ID=1
https://pairit.pairium.ai/my-study-qa-k3f9x2m8q1?PROLIFIC_PID=bot_qa_2&STUDY_ID=qa&SESSION_ID=2
```

Start every ID with the same prefix (here `bot_qa_`) so the audit can find them. Use a new prefix or note the time for each run, so you can check one run at a time.

A coding agent can drive these browsers for you with Playwright. Copy this prompt and fill in the brackets:

```text
Write and run an end-to-end Playwright test for my Pairit study.

- Study URL: https://pairit.pairium.ai/[CONFIG_ID]
- Config file: [PATH TO study.yaml]. Read it to learn the pages, buttons,
  survey questions and group size.
- Participants: [N]. Open each in its own browser context, at the study URL
  with ?PROLIFIC_PID=bot_qa_<n>&STUDY_ID=qa&SESSION_ID=<n>. Start them at
  the same time so they are matched into groups.

Drive every participant from the first page to the end page. While doing so:
- Have several participants click, submit or send chat messages at the same
  moment.
- Cover every condition and branch in the config.
- Have at least one participant leave every optional question blank.
- Record console errors and failed network requests.
- Wait for the end page to load before closing a browser.

Then run:
  pairit data audit [CONFIG_ID] --pid-prefix bot_qa_ --since <start time> \
    --config [PATH TO study.yaml] --require-state [KEYS MY ANALYSIS NEEDS]
  pairit data export [CONFIG_ID] --format json --out qa_export/

Report every audit error, every console or network error, and any action a
participant took (a message, a choice, an answer) that is missing from the
export. If something fails, find the cause, fix the config, upload it again
with `pairit config upload --name [QA NAME]`, and repeat the test with a new --since time.
Do not change the study design to make the test pass; ask me first.
```

## 3. Audit the data

```bash
pairit data audit my-study-qa-k3f9x2m8q1 --pid-prefix bot_qa_ --since 2026-11-23T10:00:00Z \
  --config study.yaml --require-state treatment,choice
```

The audit reports:

- each session that did not reach an end page, and the page it stopped on;
- each required survey answer that was not saved (with `--config`);
- each finished session missing a `session_state` key your analysis needs (with `--require-state`);
- groups where only some members finished;
- sessions that span more than one config revision. Narrow the run with `--since`.

It exits with status 1 if it finds errors, so an agent or script can tell whether the run passed.

## 4. Run your analysis on the test data

Export the test data and run your analysis script on it before launch:

```bash
pairit data export my-study-qa-k3f9x2m8q1 --format csv --out qa_export/
```

If a variable is missing or hard to parse, you find out before paying participants.
