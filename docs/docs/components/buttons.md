# Buttons

Buttons render one or more actions the participant can take. Use a ButtonGroup to coordinate shared behavior across multiple buttons.

Props
- buttons: array of { id: string, text: string, action: Action }

Example

```yaml
pages:
  - id: consent
    text: "Do you consent to participate?"
    buttons:
      - id: yes
        text: "I consent"
        action: { type: go_to, target: survey }
      - id: no
        text: "I do not consent"
        action: { type: end }
```

ButtonGroup (conceptual)
- Coordinates layout and shared disabled/loading states across multiple Button components.


