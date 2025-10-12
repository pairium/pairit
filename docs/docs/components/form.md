# Form

Render general-purpose form fields when Survey is not a fit.

Example

```yaml
pages:
  - id: feedback
    components:
      - type: form
        props:
          fields:
            - type: text
              id: comments
              label: "Comments"
```


