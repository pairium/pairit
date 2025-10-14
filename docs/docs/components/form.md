# Form

Render general-purpose form fields when Survey is not a fit.

Events
- `onSubmit`: emitted when form is submitted
- `onFieldChange`: emitted when any field value changes

Event Data
- `form_id`: identifier of the form component
- `field_values`: object containing all current field values (onSubmit)
- `field_id`: which field changed (onFieldChange)
- `field_value`: new value of the changed field (onFieldChange)
- `field_type`: type of the field that changed (onFieldChange)
- Custom data can be added via `events.{eventName}.data`

Example

```yaml
pages:
  - id: feedback
    components:
      - type: form
        id: feedback_form
        props:
          fields:
            - type: text
              id: comments
              label: "Comments"
        events:
          onSubmit:
            type: "feedback_submitted"
            data:
              form_type: "general_feedback"
          onFieldChange:
            type: "form_field_updated"
            data:
              form_type: "general_feedback"
```


