# Custom Components

Mount registered custom components with validated props and events.

Registry entries (author-time)

```yaml
components:
  - id: rating_widget
    version: 1.0.0
    propsSchema:
      type: object
      properties:
        max: { type: integer, minimum: 3, maximum: 10 }
      required: [max]
      additionalProperties: false
    events:
      - name: rating_submitted
        payloadSchema:
          type: object
          properties:
            value: { type: integer, minimum: 1 }
          required: [value]
```

Usage in a page

```yaml
pages:
  - id: rate
    component:
      component: rating_widget
      props:
        max: 5
      unknownEvents: error
    buttons:
      - id: rate-submit
        text: "Submit rating"
        action: { type: go_to, target: thanks }
  - id: thanks
    end: true
```

Unknown events policy
- error (default): reject and log
- warn: log and drop
- ignore: drop silently


