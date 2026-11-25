# Participant UX & Copy Reference

Concrete patterns distilled from live Pairit QA iterations.

## 1. Consent Page Layout (Footer Pattern)

Keep consent to one clean screen: a concise title, 2–3 plain-English bullets (what you do + time, pay + bonus upside + floor, voluntary + privacy), the two action buttons, and a single italicized institutional footer below a horizontal rule.

```yaml
  - id: consent
    onEnter:
      - type: randomize
        scope: session
        assignmentType: balanced_random
        stateKey: treatment
        conditions: [A, B]
    components:
      - type: text
        props:
          markdown: true
          text: |
            # <Clear Study Title>

            <1-2 sentence plain-English summary of what you will do and total time (~8 minutes).>

            - **Pay:** **$X.XX base pay** plus **up to $Y.YY+ in bonus pay** (<exact per-item gain/loss rules>; typical total **$A–$B**, paid via Prolific within 48 hours). Your total study bonus pay never drops below $0.00.
            - **Voluntary & private:** Participation is voluntary (18+, fluent English, desktop/laptop) and you may close the tab at any time. We record only your in-study clicks, timestamps, and optional survey answers — no name, email, IP address, or audio/video. Prolific IDs are used solely for payment and deleted afterward.
      - type: buttons
        props:
          buttons:
            - id: consent_agree
              text: "I agree — Start Study"
              action:
                type: go_to
                target: overview
            - id: consent_decline
              text: "I do not wish to participate"
              action:
                type: go_to
                target: opt_out
      - type: text
        props:
          markdown: true
          text: |
            ---

            *<University> · Principal Investigator: <PI Name> (<pi@email>) · Questions: <IRB Office> (<phone>, <irb@email>, App. <IRB_NUMBER>).*

  - id: opt_out
    end: true
    components:
      - type: text
        props:
          markdown: true
          text: |
            # No Problem

            No study data have been recorded. You may close this tab and return your submission on Prolific without penalty.
```

Rules for consent copy:
- Never place the university/PI/IRB lines at the top of the page — put them together in the single italicized footer below the buttons.
- Keep consent, IRB attachments, and live study mechanics 100% consistent (pay math, logged telemetry, optional surveys).
- Never use inline code backticks (`like this`) in participant prose; use **bold** or plain text.

## 2. Copy Cleanup Checklist

| Remove / Avoid | Replace With |
|---|---|
| `"Bonus"` | `"Bonus pay"` (everywhere: top bar, consent, rules, summaries, debrief) |
| Contextless record tags (`PO-1001`, `ORIGINAL RECORD`, `VERIFIED SOURCE`, `AGENT EXTRACTION`, `Sample Agent`) | Delete completely — let the visual layout speak |
| Redundant directional hints (`Compare left → right`) when layout is obvious | Short task-specific line only where needed |
| Vague action buttons (`Approve`, `Flag`, `Submit`) | Real-world verbs matching the task (`Approve Analysis`, `Send Email`, `Approve Refund`) |
| Ambiguous toggle labels (`Auto` / `Auto ON`) | Explicit labels (`Auto-approve: OFF` / `Auto-approve: ON`) and non-duplicate status pills (`Unchecked`, `3 sent`) |
| Opaque study jargon (`block bonus`, `choice 1`, `5 numbers of agents`, `Single-player Pairit study`) | Plain English (`Round net pay`, `Round 1 of 6 · Choose Agents`, `Online study`) |
| Hidden input bounds (showing an error only after submitting `50`) | State upfront (`Enter a whole number from 1 to 20`) AND keep validation branches |

## 3. Step-by-Step Guided Practice

Every interactive mechanic that appears in a scored round must be experienced once in Practice first:

1. **Role Overview first (1 short native page):** Explain the 1-sentence job story, what each role/agent produces, why it takes time, and how checking works.
2. **Visual cues, not walls of text:**
   - On a clean example, pulse the primary action button with a directional cue (`← All 4 match — click here`).
   - On an error example, if the participant clicks the wrong action, immediately pulse the actual mistake in red (`← Click the wrong line`).
   - On a multi-card selection example, show a 2-card strip with a pulsing `Ready` card (`← Click to open`) that they must click before reviewing the draft.
3. **Dedicated confirmation screen per example:** After each correct practice response, transition to a clean confirmation view explaining *why* it was correct with a `Next Example →` button. Never flash a tiny toast and immediately swap the next stimulus underneath the user's cursor.
4. **Interactive toggle preview:** If real rounds include a toggle (like `Auto-approve: OFF / ON`), embed a live clickable preview card on the final practice confirmation screen that explains the exact stakes before Round 1 begins.
5. **Match visual form to the artifact:**
   - Data analysis → clean compact table on the left, 4 takeaway lines on the right.
   - Email drafting → bullet notes on the left, a cohesive email sheet (`To: ...`, flowing sentences with subtle hover-to-flag highlight) on the right — **not** 4 detached pill buttons.
   - Support ticket → customer ticket + policy on the left, 4 refund fields on the right.

## 4. Pacing & Unnecessary Complexity

- **Target ~8–12 minutes total** for standard online behavioral studies unless the design genuinely requires longer.
- **No hostage waiting:** Do not trap participants inside 2–3 minute countdowns with only 1–2 items to click.
- **Question every calibration / warmup block:** Before adding an unpaid warmup or speed-check block, ask whether a fixed exogenous grid (e.g., `[1, 2, 4, 8]` in counterbalanced order) already covers everyone's range and gives cleaner, strictly exogenous identification.
- **Cut fragile bells and whistles:** Skip audio chimes (`AudioContext` is suspended by Chrome across fresh iframes until user gesture) and skip optional UI toggles that aren't part of the research question.
