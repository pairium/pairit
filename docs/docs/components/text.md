# Text

Display static text. Content is always rendered as markdown.

Props
- text: string
- markdown?: boolean -- has no effect; text is always rendered as markdown

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


