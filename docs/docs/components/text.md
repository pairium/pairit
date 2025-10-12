# Text

Display static text. Supports optional markdown.

Props
- text: string
- markdown?: boolean

Example

```yaml
pages:
  - id: intro
    components:
      - type: text
        props:
          text: |
            Welcome to the study!
          markdown: false
```


