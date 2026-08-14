# HTML

Upload your own UI and show it in a locked-down frame. Use it for custom sliders, games, or a pre-built React app. See the [HTML example](../examples.md#html).

The file is uploaded with the config. Pairit only exchanges the `session_state` keys you list.

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

## Helper API

Pairit injects a `pairit` helper. That name is reserved.

| Call | Direction | Writes | Description |
|------|-----------|--------|-------------|
| `pairit.ready(fn)` | In | — | Runs once with the `read` keys after load. Safe to call late. |
| `pairit.setState(data)` | Out | `session_state`, `onState` | Saves keys listed in `write`. Extra keys are dropped. |
| `pairit.event(name, data)` | Out | Event log | Logs a custom event. Does not change `session_state`. |
| `pairit.done()` | Out | `onDone` | Marks the task finished. Unlocks Next if `required`. Does not save data. |

`pairit.state` is the same snapshot `ready` receives.

- Keys not in `read` are never sent into the iframe.
- Keys not in `write` are never saved. There is no error — they are dropped.
- A key in `read` that is not in `session_state` yet is omitted from `pairit.state`.
- `setState` with no allowed keys is ignored. `onState` does not fire.
- Incoming keys are sent once on load. Later `session_state` changes do not reach the iframe.

## Usage

### Local file

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

```zsh
pairit config lint experiment.yaml
pairit config upload experiment.yaml --config-id my-exp
```

Lint checks the file. Upload attaches it and includes it in the config checksum. Compile does not attach the file.

### Read keys on load

List incoming keys in `read`. Get them in `pairit.ready`:

```yaml
props:
  src: slider.html
  read: [treatment]
```

```js
pairit.ready(function (state) {
  if (state.treatment) {
    label.textContent = "Condition " + state.treatment;
  }
});
```

### Write answers

List outgoing keys in `write`. Save them with `pairit.setState`. Later pages can use `{{session_state.rating}}`.

```yaml
props:
  src: slider.html
  write: [rating, rt_ms]
```

```js
pairit.setState({ rating: Number(slider.value), rt_ms: Date.now() - start });
pairit.done();
```

Call `setState` before `done`. `done` does not save data.

### Require completion

Set `required: true` to block Next until the embed calls `pairit.done()`. If the participant clicks Next first, they see "Complete the task above to continue."

```yaml
props:
  src: slider.html
  required: true
```

Use `action` to navigate when the embed calls `done`, instead of waiting for a button.

### Log extra events

Use `pairit.event` for traces you do not need later. They go to the event log only.

```js
pairit.event("slider_move", { x: 2 });
```

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

## Example

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

  pairit.ready(function (state) {
    if (state.treatment) {
      label.textContent =
        "Condition " + state.treatment + ": How do you feel about this?";
    }
  });

  document.getElementById("submit").addEventListener("click", function () {
    pairit.setState({
      rating: Number(slider.value),
      rt_ms: Date.now() - start,
    });
    pairit.done();
  });
</script>
```
