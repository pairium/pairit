# Survey

Survey groups manage a sequence of questions with validation and paging. On submit, answers are written to `$.user_state` keyed by question `id`.

Question types
- numeric, likert5/7, multiple_choice (choices required), free_text, etc.

Example

```yaml
pages:
  - id: start_survey
    survey:
      - id: age
        text: "How old are you?"
        answer: numeric
      - id: satisfaction
        text: "How satisfied are you with our service?"
        answer: likert5
```


