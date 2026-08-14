# HTML

Upload your own UI and show it in a locked-down frame. Use it for custom sliders, games, or a pre-built React app. See the [HTML example](../examples.md#html).

The file is uploaded with the config. Pairit only exchanges the `session_state` keys you list. Pairit does not style the HTML inside the frame — the file looks however you wrote it.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | string | — | Path to a local `.html` file, relative to the YAML (required) |
| `read` | string[] | `[]` | `session_state` keys sent into the embed on load |
| `write` | string[] | `[]` | `session_state` keys the embed is allowed to write |
| `height` | number | `400` | Frame height in pixels |
| `required` | boolean | `false` | Block Next until the embed calls `pairit.done()` |
| `action` | ButtonAction | — | Optional navigation when the embed calls `pairit.done()` |

## Events

| Event | Description |
|-------|-------------|
| `onLoad` | Emitted when the frame loads |
| `onState` | Emitted when the embed writes allowed state keys |
| `onDone` | Emitted when the embed calls `pairit.done()` |

Custom data can be added via `events.{eventName}.data`. The embed can also call `pairit.event(name, data)` to log extra events.

## Usage

Put the HTML file next to the YAML and point at it:

```
my-experiment/
  experiment.yaml
  slider.html
```

```yaml
components:
  - type: html
    id: slider_task
    props:
      src: slider.html
      read: [treatment]
      write: [rating, rt_ms]
      height: 400
      required: true
```

Then:

```zsh
pairit config lint experiment.yaml
pairit config upload experiment.yaml --config-id my-exp
```

Lint checks the file. Upload attaches it and includes it in the config checksum. Compile does not attach the file.

## How data moves

Two stores: `session_state` (answers you reuse later) and the event log (a record of what happened).

1. YAML lists which keys go in and out: `read` and `write`.
2. On load, Pairit copies the `read` keys from `session_state` and sends them **once**. Your file sees them as `pairit.state`, and on the `pairit:init` event.
3. When the participant finishes, your file calls `pairit.setState({ rating: 4 })`.
4. Pairit keeps only keys listed in `write`. Extra keys are dropped. Then it saves to the session.
5. Later pages can show the value with `{{session_state.rating}}`.
6. `pairit.done()` means “this task is finished.” It unlocks Next if `required: true`. It does not save data — call `setState` first.
7. `pairit.event(...)` writes to the event log only. It does not change `session_state`.

If something else changes `session_state` after load, the iframe does not hear about it.

## What gets saved

| Call | `session_state` | Event log | Notes |
|------|-----------------|-----------|-------|
| `pairit.setState({ rating: 4, extra: 1 })` | Only keys in `write` | `onState` | `extra` is dropped if it is not in `write` |
| `pairit.event('slider_move', { x: 2 })` | No | Yes, as that event name | Use for traces you do not need later |
| `pairit.done()` | No | `onDone` | Unlock Next / run `action` |

Rules:

- Keys not in `read` are never sent into the iframe.
- Keys not in `write` are never saved. There is no error — they are dropped.
- A key in `read` that is not in `session_state` yet is omitted from `pairit.state`.
- `setState` with no allowed keys is ignored. `onState` does not fire.
- Listen for `pairit:init` **and** check `pairit.state` on startup. Either can win the race.

## Talking to Pairit

Pairit injects a `pairit` helper. That name is reserved.

```js
pairit.state          // snapshot of the read keys, set on load
pairit.setState({ rating: 4, rt_ms: 1200 })
pairit.event('onResponse', { extra: 1 })
pairit.done()
```

Typical submit handler:

```js
pairit.setState({ rating: Number(slider.value), rt_ms: Date.now() - start });
pairit.done();
```

If `required` is true and the participant clicks Next before `pairit.done()`, they see "Complete the task above to continue."

## Styling

Pairit does not style the HTML inside the frame. Put CSS in a `<style>` tag or on the elements. The iframe cannot see Pairit’s page styles, and it cannot load CSS from the internet.

The frame around your file has a light border and rounded corners. That is the only Pairit styling.

## Safety

- The file runs in an iframe that can run scripts and almost nothing else
- No network: no CDN, no remote images, no `fetch`
- Images must be `data:` or `blob:` URLs
- The embed never sees the session token
- It can only write the keys in `write`
- Remote `http://` / `https://` sources are rejected
- Max file size is 1 MB

You are responsible for the UI you upload. Participants see whatever you put in the file.

## React and other frameworks

A pre-built React (or Vue, Svelte) app works if it is one self-contained HTML file with the framework inlined. Pairit does not compile `.tsx` or JSX, and the iframe cannot load React from the internet. Build first, then upload the output.

First-party React widgets shipped in the lab app may come later. For your own UI, use this HTML component.

## Full example

Condition is assigned on the intro page, sent into the slider, then shown on the thanks page.

`experiment.yaml`:

```yaml
schema_version: 0.1.0
allowRetake: true
initialPageId: intro

pages:
  - id: intro
    onEnter:
      - type: randomize
        assignmentType: random
        conditions: [A, B]
        stateKey: treatment
    components:
      - type: text
        props:
          text: "Rate the item on the next page."
      - type: buttons
        props:
          buttons:
            - id: start
              text: Continue
              action: { type: go_to, target: task }

  - id: task
    components:
      - type: html
        id: slider_task
        props:
          src: slider.html
          read: [treatment]
          write: [rating, rt_ms]
          required: true
        events:
          onState:
            type: slider_response
          onDone:
            type: slider_done
      - type: buttons
        props:
          buttons:
            - id: next
              text: Next
              action: { type: go_to, target: thanks }

  - id: thanks
    end: true
    components:
      - type: text
        props:
          text: |
            Condition: **{{session_state.treatment}}**

            You rated **{{session_state.rating}}**.
```

`slider.html`:

```html
<div style="font-family: system-ui, sans-serif; padding: 16px; max-width: 28rem;">
  <p id="label">How do you feel about this?</p>
  <input id="slider" type="range" min="1" max="7" value="4" style="width: 100%;" />
  <p>Rating: <span id="value">4</span></p>
  <button id="submit" type="button">Submit</button>
</div>
<script>
  const start = Date.now();
  const slider = document.getElementById("slider");
  const value = document.getElementById("value");
  const label = document.getElementById("label");

  slider.addEventListener("input", function () {
    value.textContent = slider.value;
  });

  function applyTreatment(state) {
    const treatment = state && state.treatment;
    if (treatment) {
      label.textContent =
        "Condition " + treatment + ": How do you feel about this?";
    }
  }

  window.addEventListener("pairit:init", function (event) {
    applyTreatment(event.detail);
  });
  if (window.pairit && window.pairit.state) {
    applyTreatment(window.pairit.state);
  }

  document.getElementById("submit").addEventListener("click", function () {
    pairit.setState({
      rating: Number(slider.value),
      rt_ms: Date.now() - start,
    });
    pairit.done();
  });
</script>
```
