# Survey

Survey groups manage a sequence of questions with validation and paging. On submit, answers are written to `$.user_state` keyed by question `id`.

## Structure

- `survey` accepts either a shorthand definition for common flows or an explicit list of survey items.
- The shorthand form keeps each entry concise (`text`, `answer`, optional `id`). The builder expands it into full survey items.
- The explicit form exposes every field on a survey item. Use it when you need media, custom validation, or atypical layouts.

## Survey items

- `id`: stable key for storing answers in `$.user_state`.
- `text`: prompt shown to the participant.
- `media` (optional): asset reference or component for rich prompts.
- `answer`: configuration for how the participant responds.
- `next` (optional): string or map that chooses the next page id. Provide a single page id to jump unconditionally, or map answer values to page ids for branching.

## Answer types

- `text`: accepts arbitrary text input.
- `numeric`: accepts numbers with optional min, max, and step.
- `multiple_choice`: accepts a list of options and renders radio buttons (single select).
- `multi_select`: accepts a list of options and renders checkboxes (multi select).
- `likert5` and `likert7`: predefined radio scales with consistent labeling.
- You can extend answer types with custom components. Provide `component` and any `props` the renderer requires.

## Examples

Shorthand survey definition:

```yaml
pages:
  - id: onboarding
    survey:
      - id: age
        text: "How old are you?"
        answer: numeric
      - text: "Pick your plan"
        answer:
          multiple_choice:
            choices:
              - Starter
              - Pro
              - Enterprise
      - id: features
        text: "Select the features you care about most"
        answer:
          multi_select:
            choices:
              - Collaboration
              - Analytics
              - Integrations
      - id: feedback
        text: "Anything else we should know?"
        answer: free_text
```

Explicit survey items with media and branching:

```yaml
pages:
  - id: start
    survey_items:
      - id: welcome
        text: "Watch this intro video before you start."
        media:
          type: video
          src: intro.mp4
        answer: free_text
      - id: track_choice
        text: "Which track fits you best today?"
        answer:
          radio:
            choices:
              - "Beginner track"
              - "Advanced track"
        next:
          "Beginner track": basics_page
          "Advanced track": advanced_page
  - id: basics_page
    survey_items:
      - id: foundations_confidence
        text: "How confident do you feel with the fundamentals?"
        answer:
          likert5: {}
        next: recap_page
  - id: advanced_page
    survey_items:
      - id: advanced_confidence
        text: "How confident do you feel after the advanced walkthrough?"
        answer:
          likert7: {}
        next: recap_page
  - id: recap_page
    survey_items:
      - id: recap_notes
        text: "Any notes before we finish?"
        answer: free_text
```

In this flow the `track_choice` item maps each answer to the next page. Participants who pick the beginner track visit `basics_page`, while everyone else continues to `advanced_page`. Both paths converge on `recap_page` for the final prompt. If you omit `next`, the survey will advance through pages in the order they are defined.

For implementation details, see `Developer → Survey`.


