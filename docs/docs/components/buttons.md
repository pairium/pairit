# Buttons

Buttons render one or more actions the participant can take. Use a ButtonGroup to coordinate shared behavior across multiple buttons.

## Props

Each button in the `buttons` array supports:

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Unique identifier for the button |
| `text` | string | Yes | Button label text |
| `action` | Action | Yes | Navigation action (go_to, next, end) |
| `highlightWhen` | string | No | User state key that triggers highlight styling |
| `events` | object | No | Event configuration for onClick |

## highlightWhen

Conditionally highlight a button based on user state. When the specified state key is truthy, the button displays with highlighted styling (visual emphasis to draw attention).

```yaml
buttons:
  - id: finish
    text: "Finish Chat"
    highlightWhen: chat_ended  # Highlights when $.user_state.chat_ended is truthy
    action: { type: go_to, target: outro }
```

This is useful for:
- Drawing attention to a "Continue" button after an AI agent ends a chat
- Indicating when a required condition is met
- Guiding participants to the next action

The highlight check is simple: if `$.user_state.{highlightWhen}` is truthy, the button is highlighted.

## Events
- `onClick`: emitted when button is clicked (default event type: "button_click")

Event Data
- `button_id`: the button's id
- `label`: the button's text
- Custom data can be added via `events.onClick.data`

Example

```yaml
pages:
  - id: consent
    text: "Do you consent to participate?"
    buttons:
      - id: yes
        text: "I consent"
        action: { type: go_to, target: survey }
        events:
          onClick:
            type: "consent_given"
            data:
              consent: true
              button_id: "yes"
      - id: no
        text: "I do not consent"
        action: { type: end }
        events:
          onClick:
            type: "consent_denied"
            data:
              consent: false
              button_id: "no"
```

ButtonGroup (conceptual)
- Coordinates layout and shared disabled/loading states across multiple Button components.


