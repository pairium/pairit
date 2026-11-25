# Pairit Architecture, Layout & Runtime Patterns

Reference for Pairit `schema_version: 0.1.0` (Platform `2026.11.25+`, CLI `0.3.10+`).

## 1. Native-First Page Splitting

Use native Pairit pages for everything except the live custom interactive UI:

| Screen | Pairit Implementation |
|---|---|
| Consent & Opt-out | Native `text` + `buttons` + italicized footer `text`; `opt_out` with `end: true` |
| Randomization | `onEnter` on initial page (`type: randomize`, `scope: session`, `assignmentType: balanced_random`) |
| Overview & Rules | Native `text` with atomic `when:` conditions + `buttons` |
| Numeric / choice inputs | Native `text` + `survey` (`answer: numeric`) + `buttons` with `action.branches` validation + conditional error `text` |
| Interactive task / Practice / Timed rounds | `width: wide` page with single `html` component (`borderless: true`, default `height: auto`, `action: { type: go_to, target: ... }`) |
| Round summaries | Native `text` using `{{session_state.*}}` + `buttons` |
| Wrap-up survey | Native `text` + `survey` (`required: false`) + `buttons` |
| Debrief | Native `text` on `end: true` page with `endRedirectUrl` |

## 2. Clean Wide Borderless `html` Embed Pattern

### YAML

```yaml
  - id: round_1
    width: wide
    components:
      - type: html
        id: ws_round_1
        props:
          src: renderers/workspace.html
          read: [error_rate, agent_mix, study_state]
          write: [study_state, total_bonus, total_bonus_str, last_bonus_str]
          borderless: true
          action:
            type: go_to
            target: round_1_done
        events:
          onState:
            type: workspace_state_saved
          onDone:
            type: round_1_completed
```

Key behaviors:
- `width: wide` widens the page card from `max-w-3xl` (`768px`, ~`684px` inner) to `max-w-5xl` (`1024px`, ~`942px` inner).
- `borderless: true` removes the iframe border and rounded corners so the embed sits flush on the white page card.
- `height` defaults to `"auto"` (tracked via `ResizeObserver` + `MutationObserver`). Omit numeric `height` unless you specifically want a fixed scrollable box.
- `action` navigates automatically when the embed calls `pairit.done()`, flushing pending `pairit.setState()` writes and `onDone` first. **Do not** add a second `buttons` component underneath the `html` embed.
- For two-column pages with Pairit's built-in `chat` or `live-workspace`, use `layout: split` (`max-w-7xl`, viewport-filling columns, optional numeric `height` on the page).

### Embed CSS Reset (Eliminating Panel-Ception & Scroll Bugs)

```css
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  height: auto;
  background: #ffffff;
  font-family: system-ui, -apple-system, sans-serif;
}
```

Layout rules inside the embed:
1. **No nested outer box:** Never wrap the whole embed in a gray `body` + bordered `.card` — Pairit already provides the white outer card.
2. **Respect actual iframe width:** Keep side-by-side (`grid-template-columns: 1fr 1fr`) active down to at least `620px` (not `740px` or `900px`) so default (`~660–684px`) and wide (`~942px`) embeds never silently stack `"left"` and `"right"` vertically.
3. **Fixed card width across counts:** For grids of cards (e.g., 1 to 20 agents), always use a fixed column count like `grid-template-columns: repeat(4, minmax(0, 1fr))` rather than `auto-fit` — a single card (`N = 1`) must have the exact same width as cards in `N = 4` or `N = 8`.
4. **No inner scrollboxes that fight re-renders:** Do not put `max-height` + `overflow-y: auto` on dynamic grids inside `height: auto` embeds. Let the iframe grow cleanly so participants never get snapped back to the top on re-render.
5. **Self-contained only:** Embeds run sandboxed with no network (`fetch`, CDNs, external fonts/images fail). Inline CSS/JS/data and keep the compiled HTML file strictly under **1 MB**.

### Embed Bridge Ordering

```js
// Always write state BEFORE signaling done; Pairit flushes setState before action navigation.
pairit.setState({
  study_state: nextStudyState,
  total_bonus: totalBonus,
  total_bonus_str: formatSignedOrDollar(totalBonus),
});
pairit.done();
```

- Declare every key passed to `pairit.setState()` in `session_state:` **and** in `html.props.write:`. Undeclared keys are silently dropped.
- Use `pairit.event(name, payload)` for granular interaction traces that don't need to live in `session_state`.

## 3. Runtime Gotchas & Guardrails

- **Atomic `when:` expressions only:** Write separate components with atomic conditions (`when: "session_state.agent_mix == 'mixed'"`, `when: "session_state.same_domain == 'analysis'"`) instead of compound `or` / `and` / parentheses, which can evaluate unexpectedly in the safe expression subset.
- **No `when:`-gated `buttons` next to an `html` embed:** A conditional `buttons` component sharing a page with an `html` embed can flicker or detach during `pairit.setState()` re-syncs. Use `html.props.action` + `pairit.done()` instead.
- **Numeric range validation in native `survey` + `buttons`:**

```yaml
      - type: text
        when: "session_state.choice_1_n > 20"
        props:
          markdown: true
          text: "> **Note:** Please enter a whole number from 1 to 20."
      - type: text
        when: "session_state.choice_1_n < 1"
        props:
          markdown: true
          text: "> **Note:** Please enter at least **1**."
      - type: survey
        id: choice_1_form
        props:
          items:
            - id: choice_1_n
              text: "Number of parallel agents"
              required: true
              answer: numeric
      - type: buttons
        props:
          buttons:
            - id: start_choice_1
              text: "Start Round 1 →"
              action:
                type: go_to
                branches:
                  - when: "session_state.choice_1_n < 1"
                    target: choice_1_pick
                  - when: "session_state.choice_1_n > 20"
                    target: choice_1_pick
                  - target: choice_1_run
```

- **`end: true` pages:** Pairit renders the page's own `components` on completion and puts the `endRedirectUrl` **Continue** button below a divider (no hardcoded `"Back to examples"`). Always include clear completion or opt-out text.

## 4. Essential CLI Commands

```bash
pairit config lint experiment.yaml
pairit config compile experiment.yaml --out experiment.json
pairit config upload --name my-study-qa experiment.yaml
pairit config list
pairit config history <configId>
pairit data audit <configId> --pid-prefix bot_qa_ --since <ISO> --config experiment.yaml --require-state key1,key2
pairit data export <configId> --format json --out qa_export/
```

- Pass LLM provider keys via `--openai-api-key-env OPENAI_API_KEY` or `--anthropic-api-key-env ANTHROPIC_API_KEY` (never raw keys on the command line).
- Re-uploading under the same `--name` preserves the URL and bumps the revision; changing only `allowRetake` updates live without bumping the revision.
