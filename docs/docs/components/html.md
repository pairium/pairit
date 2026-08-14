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

## Talking to Pairit

Pairit injects a `pairit` helper. That name is reserved.

```js
pairit.state          // snapshot of the read keys, set on load
pairit.setState({ rating: 4, rt_ms: 1200 })
pairit.event('onResponse', { extra: 1 })
pairit.done()
```

State is sent once on load. Later `session_state` changes are not pushed back in.

If `required` is true and the participant clicks Next before `pairit.done()`, they see "Complete the task above to continue."

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

## Full example

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
          src: html-demo/slider.html
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
          text: "You rated **{{session_state.rating}}**."
```
