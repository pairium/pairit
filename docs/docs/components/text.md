# Text

Display static text. Content is always rendered as markdown. 

Fenced `mermaid` blocks render as diagrams. See the [Mermaid example](../examples.md#mermaid).

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

Mermaid example

````yaml
pages:
  - id: intro
    components:
      - type: text
        props:
          text: |
            Here is the study flow:

            ```mermaid
            flowchart LR
              consent --> survey
            ```
````
