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

Additional contract fields
- `capabilities`: allowlisted runtime affordances (e.g., `clipboard`, `fileUpload`). Network access is never granted through this field.
- `version`: resolved at publish time and recorded with the run for audit.
- `propsSchema`: JSON Schema subset enforced during compilation and mount.
- `events[*].payloadSchema`: validates event payloads emitted by the component.

Runtime behavior
- When the component emits an event, the runtime validates it against the declared schema before routing or assignments run.
- Undeclared events follow the `unknownEvents` policy; use `warn` during development to log unexpected usage without aborting the session.
- If the registry does not have an implementation for a declared component id, the runtime throws `missing_component` and blocks the run until the implementation ships.


