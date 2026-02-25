# Timer

Countdown timer that auto-navigates when time expires. Use it for timed reading passages, discussion deadlines, or any page that should advance automatically after a set duration.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `duration` | number | — | Total seconds for the countdown (required) |
| `warning` | number | — | Remaining-seconds threshold to enter warning state |
| `visible` | boolean | `true` | Show the countdown UI; set `false` for invisible deadlines |
| `action` | ButtonAction | — | Navigation action to execute on expiry |

## Events

| Event | Description |
|-------|-------------|
| `onStart` | Emitted when the timer begins |
| `onWarning` | Emitted when remaining time drops to the `warning` threshold |
| `onExpiry` | Emitted when the timer reaches zero |

Custom data can be added via `events.{eventName}.data`.

## Usage

### Basic countdown with auto-navigation

```yaml
components:
  - type: timer
    props:
      duration: 45
      warning: 30
      action:
        type: go_to
        target: next_page
    events:
      onExpiry:
        type: timer_expired
```

### Invisible deadline

Hide the countdown UI while still enforcing a time limit:

```yaml
components:
  - type: timer
    props:
      duration: 120
      visible: false
      action:
        type: go_to
        target: timeout_page
```

### Branching on expiry

Use `action.branches` to route participants based on state:

```yaml
components:
  - type: timer
    props:
      duration: 60
      warning: 15
      action:
        type: go_to
        branches:
          - when: "user_state.treatment == 'A'"
            target: debrief_a
          - target: debrief_b
    events:
      onStart:
        type: timer_started
      onWarning:
        type: timer_warning
      onExpiry:
        type: timer_expired
```

## Visual states

The timer cycles through three visual states:

| State | Color | Trigger |
|-------|-------|---------|
| Running | Blue | Timer starts |
| Warning | Amber | Remaining ≤ `warning` seconds |
| Expired | Red | Timer reaches 0 |

When `visible` is `false`, no UI renders but all events and navigation still fire.
