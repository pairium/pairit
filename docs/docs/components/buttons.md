# Buttons

Buttons render one or more actions the participant can take. Use a ButtonGroup to coordinate shared behavior across multiple buttons.

Props
- buttons: array of { id: string, text: string, action: Action, events?: { onClick: EventConfig } }

Events
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


