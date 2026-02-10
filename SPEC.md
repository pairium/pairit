# Pairit Spec

Pairit is a platform for running behavioral science experiments online. Experimenters write a YAML config, publish it with a CLI, and share a link. Participants open the link and move through pages — surveys, matchmaking queues, chat rooms with humans or AI agents — and their interactions are recorded as structured events in MongoDB. The platform should feel invisible: participants see a clean, fast UI; experimenters write a short config and get data out.

---

## Target Configs

These four configs define "done." Each one must run end-to-end — from participant opening the link to session data appearing in MongoDB.

### Config 0: Hello world

The simplest possible experiment. One page, one question, one button. This is the onboarding experience — if this takes more than 10 lines of YAML, something is wrong.

```yaml
initialPageId: survey

pages:
  - id: survey
    survey:
      - id: mood
        text: "How are you feeling today?"
        answer: likert5
    buttons:
      - id: done
        text: "Submit"
        action: { type: go_to, target: thanks }

  - id: thanks
    text: "Thanks for your response!"
    end: true

user_state:
  mood: int
```

**What should happen:**

1. Participant opens `lab-url/hello-world`
2. Sees one Likert question and a Submit button
3. Clicks Submit → thanks page → session ends
4. `user_state.mood` is set in the session document
5. Button click and survey submission are in the `events` collection

---

### Config 1: Survey only

The simplest possible experiment. No real-time features. Tests the core page/routing/survey/event pipeline.

```yaml
initialPageId: consent

pages:
  - id: consent
    text: |
      # Informed Consent

      You are being invited to participate in a research study.
      Your participation is voluntary.
    buttons:
      - id: accept
        text: "I consent"
        action: { type: go_to, target: demographics }
      - id: decline
        text: "I do not consent"
        action: { type: go_to, target: declined }

  - id: declined
    text: "Thank you for your time."
    end: true
    endRedirectUrl: "https://app.prolific.com/submissions/complete?cc=DECLINED"

  - id: demographics
    survey:
      - id: age
        text: "What is your age?"
        answer: numeric
      - id: gender
        text: "What is your gender?"
        answer: multiple_choice
        choices: [Male, Female, Non-binary, Prefer not to say]
    buttons:
      - id: demo_next
        text: "Next"
        action:
          type: go_to
          branches:
            - when: "user_state.age < 18"
              target: ineligible
            - target: main_survey

  - id: ineligible
    text: "Sorry, you must be 18 or older to participate."
    end: true

  - id: main_survey
    survey:
      - id: satisfaction
        text: "How satisfied are you with your current work-life balance?"
        answer: likert7
      - id: sleep_hours
        text: "How many hours did you sleep last night?"
        answer: numeric
      - id: comments
        text: "Any additional comments?"
        answer: text
    buttons:
      - id: submit
        text: "Submit"
        action: { type: go_to, target: debrief }

  - id: debrief
    text: |
      # Thank you!

      Your responses have been recorded.
      You will be redirected to Prolific shortly.
    end: true
    endRedirectUrl: "https://app.prolific.com/submissions/complete?cc=ABC123"

user_state:
  age: int
  gender: string
  satisfaction: int
  sleep_hours: int
  comments: string
```

**What should happen:**

1. Participant opens `lab-url/survey-only`
2. Sees consent page with two buttons
3. "I do not consent" → ends session, redirects to Prolific with DECLINED code
4. "I consent" → demographics survey
5. Age < 18 → ineligible page (session ends)
6. Age >= 18 → main survey
7. Submits survey → debrief page → session ends → redirect to Prolific
8. All survey answers are in `user_state` in the session document
9. Button clicks and survey submissions are in the `events` collection

---

### Config 2: Chat with AI agent

A single participant chats with an AI agent. No matchmaking. Tests agent integration, chat UI, markdown rendering, tool use.

```yaml
initialPageId: intro

pages:
  - id: intro
    text: |
      # Negotiation Study

      You will negotiate the price of a used car with an AI assistant.
      Try to get the best deal you can. The AI has a reserve price it won't go below.
    buttons:
      - id: start
        text: "Start negotiation"
        action: { type: go_to, target: chat }

  - id: chat
    components:
      - type: chat
        props:
          agents: [dealer]
    buttons:
      - id: end_chat
        text: "End negotiation"
        action: { type: go_to, target: post_survey }

  - id: post_survey
    survey:
      - id: final_price
        text: "What was the final agreed price (if any)?"
        answer: numeric
      - id: satisfaction
        text: "How satisfied are you with the outcome?"
        answer: likert5
      - id: strategy
        text: "Describe your negotiation strategy."
        answer: text
    buttons:
      - id: finish
        text: "Finish"
        action:
          type: go_to
          branches:
            - when: "user_state.deal_reached == true"
              target: outro_deal
            - target: outro_no_deal

  - id: outro_deal
    text: |
      # Thank you!

      A deal was reached. Your responses have been recorded.
    end: true
    endRedirectUrl: "https://app.prolific.com/submissions/complete?cc=NEGO123"

  - id: outro_no_deal
    text: |
      # Thank you!

      No deal was reached, but your responses have been recorded.
    end: true
    endRedirectUrl: "https://app.prolific.com/submissions/complete?cc=NEGO123"

user_state:
  final_price: int
  satisfaction: int
  strategy: string
  deal_reached:
    type: bool
    default: false

agents:
  - id: dealer
    model: "gpt-4o"
    system: |
      You are a used car dealer. The car is a 2019 Honda Civic with 45,000 miles.
      Your reserve price is $12,000 — you will not sell below this.
      Your starting ask is $18,000.
      Be friendly but firm. Use negotiation tactics.
      If the buyer agrees to a price at or above $12,000, use assign_state to record the agreed price and that a deal was reached, then use end_chat.
    tools:
      - name: end_chat
        description: "End the negotiation. Disables chat and prompts participant to continue."
      - name: assign_state
        description: "Write a value to the participant's user_state."
        parameters:
          type: object
          properties:
            path:
              type: string
            value: {}
          required: [path, value]
```

**What should happen:**

1. Participant opens `lab-url/negotiation`
2. Reads intro, clicks "Start negotiation"
3. Enters chat room. AI agent (dealer) sends first message based on system prompt
4. Participant types messages, agent responds with streaming markdown
5. Agent can call `assign_state` (writes `deal_reached: true` and `agreed_price` to `user_state`) and `end_chat` (disables chat input, highlights "End negotiation" button)
6. Participant can also manually click "End negotiation" at any time
7. Post-survey captures final price, satisfaction, strategy
8. Routing branches on `user_state.deal_reached` → different outro pages
9. Session ends, redirects to Prolific
10. All chat messages are in `chat_messages` collection with sender info
11. Agent tool calls are logged as events

---

### Config 3: Matchmaking + group chat + AI agent (the full thing)

Three participants matched together. Treatment group gets an AI mediator. Control group doesn't. Tests matchmaking, group chat, treatment assignment, the full pipeline.

```yaml
initialPageId: consent

pages:
  - id: consent
    text: |
      # Team Decision Study

      You will be grouped with two other participants to make a group decision.
      Some groups will have an AI facilitator.
    buttons:
      - id: agree
        text: "I agree to participate"
        action: { type: go_to, target: pre_survey }

  - id: pre_survey
    survey:
      - id: leadership_style
        text: "How would you describe your leadership style?"
        answer: multiple_choice
        choices: [Collaborative, Directive, Delegative, Adaptive]
      - id: confidence
        text: "How confident are you in group decision-making?"
        answer: likert5
    buttons:
      - id: to_matching
        text: "Continue to matching"
        action: { type: go_to, target: matching }

  - id: matching
    components:
      - type: matchmaking
        props:
          poolId: main_pool
    buttons:
      - id: matched
        text: "Continue"
        action:
          type: go_to
          branches:
            - when: "user_state.treatment == 'facilitated'"
              target: chat_facilitated
            - target: chat_control

  - id: matching_timeout
    text: |
      We're sorry — we couldn't find enough group members at this time.
      Thank you for your willingness to participate.
    end: true
    endRedirectUrl: "https://app.prolific.com/submissions/complete?cc=TIMEOUT"

  - id: chat_control
    text: |
      **Your task:** Decide together which candidate to hire from the three profiles below.
      You have 10 minutes.
    components:
      - type: chat
    buttons:
      - id: control_done
        text: "We've decided"
        action: { type: go_to, target: post_survey_control }

  - id: chat_facilitated
    text: |
      **Your task:** Decide together which candidate to hire from the three profiles below.
      You have 10 minutes. An AI facilitator will help guide the discussion.
    components:
      - type: chat
        props:
          agents: [facilitator]
    buttons:
      - id: facilitated_done
        text: "We've decided"
        action: { type: go_to, target: post_survey_facilitated }

  - id: post_survey_control
    survey:
      - id: decision
        text: "Which candidate did your group choose?"
        answer: multiple_choice
        choices: [Candidate A, Candidate B, Candidate C, No consensus]
      - id: process_satisfaction
        text: "How satisfied were you with the decision-making process?"
        answer: likert7
      - id: partner_rating
        text: "How would you rate your partners' contributions?"
        answer: likert5
    buttons:
      - id: done_control
        text: "Submit"
        action: { type: go_to, target: debrief }

  - id: post_survey_facilitated
    survey:
      - id: decision
        text: "Which candidate did your group choose?"
        answer: multiple_choice
        choices: [Candidate A, Candidate B, Candidate C, No consensus]
      - id: process_satisfaction
        text: "How satisfied were you with the decision-making process?"
        answer: likert7
      - id: partner_rating
        text: "How would you rate your partners' contributions?"
        answer: likert5
      - id: facilitator_helpful
        text: "Was the AI facilitator helpful?"
        answer: likert5
    buttons:
      - id: done_facilitated
        text: "Submit"
        action: { type: go_to, target: debrief }

  - id: debrief
    text: |
      # Thank you!

      This study examines how AI facilitation affects group decision-making.
      Some groups had an AI facilitator and some did not.
    end: true
    endRedirectUrl: "https://app.prolific.com/submissions/complete?cc=TEAM456"

user_state:
  group_id: string
  treatment: string
  leadership_style: string
  confidence: int
  decision: string
  process_satisfaction: int
  partner_rating: int
  facilitator_helpful: int

matchmaking:
  - id: main_pool
    num_users: 3
    timeoutSeconds: 180
    timeoutTarget: matching_timeout
    assignment:
      type: balanced_random
      conditions:
        - facilitated
        - control
      field: treatment

agents:
  - id: facilitator
    model: "claude-sonnet-4-5-20250929"
    system: |
      You are a neutral facilitator helping a group make a hiring decision.
      Your role:
      - Ensure all participants share their views
      - Summarize points of agreement and disagreement
      - Ask clarifying questions
      - Do NOT express your own preference
      - If the group seems stuck, suggest a structured approach
```

**What should happen:**

1. Participant opens `lab-url/team-decision`
2. Consents, fills pre-survey
3. Enters matchmaking queue — sees waiting UI with countdown (180s)
4. If no match in 180s → timeout page → session ends → Prolific redirect with TIMEOUT code
5. If matched: server assigns treatment (`facilitated` or `control`) via balanced random. All participants in a group get the same condition. Treatment and group_id written to `user_state`
6. Routing branches on `user_state.treatment`:
   - `facilitated` → chat room with AI facilitator agent
   - `control` → chat room without agent
7. All participants see the same chat room (messages from others appear in real-time via SSE)
8. AI facilitator (if present) monitors conversation and responds as a normal chat participant
9. Any participant clicks "We've decided" → post-survey (facilitated group gets extra question about the facilitator)
10. Debrief → session ends → Prolific redirect
11. MongoDB contains: session docs with `user_state` (including `group_id` and `treatment`), all chat messages with sender attribution, all events, group record with treatment assignment

---

## Acceptance Criteria

The platform is **done** when:

1. **Config 0** runs end-to-end. One question, one button, data in MongoDB. The baseline sanity check.

2. **Config 1** runs end-to-end with a single participant. Survey answers appear in session `user_state`. Events are recorded. Branching (age < 18) works. Prolific redirect works.

3. **Config 2** runs end-to-end. Agent responds with streaming markdown. Agent can call `end_chat` and `assign_state` tools. Chat messages are persisted. Tool calls are logged as events.

4. **Config 3** runs end-to-end with three participants in separate browsers. Matchmaking groups them within the timeout window. Treatment is assigned and balanced. All participants see each other's messages in real-time. AI facilitator participates in the facilitated condition only. Page branching routes to different post-surveys per condition. Timeout redirects work.

5. **Data is complete.** For any completed session, an experimenter can reconstruct the full participant journey from MongoDB: which pages they saw, what they answered, what was said in chat, what the agent did, when each event occurred.

6. **Config is the only input.** Experimenters write YAML + run `pairit config upload`. No code changes needed to run a new experiment. Changing the model, the system prompt, the number of participants per group, or the survey questions is a YAML edit.

---

## Design Constraints

These are decisions already made. Agents should not revisit them.

| Constraint | Detail |
|------------|--------|
| Transport | SSE + POST. No WebSocket. One SSE stream per session at `GET /sessions/:id/stream`. Client actions are POST requests. SSE reconnection via `Last-Event-ID` with server-side event replay for missed messages. |
| LLM integration | Vercel AI SDK. Multi-provider (OpenAI, Anthropic, xAI, etc.). Model string in YAML config routes to provider. |
| Agent tool use | Built-in: `end_chat` (no params, disables chat + highlights continue button), `assign_state` (writes to `user_state`). Custom: experimenter defines tool name + JSON Schema parameters in YAML. Server validates and executes. |
| Page components | `survey:` is YAML shorthand; compiler desugars to `components: [{type: survey, ...}]`. Runtime uses a uniform component model. |
| Chat format | Markdown. Messages rendered with a markdown renderer on the client. |
| Expression engine | Operators: `<`, `>`, `<=`, `>=`, `==`, `!=`, `&&`, `||`. Types: numbers, strings, booleans. No library needed. Context: `user_state`. |
| Treatment assignment | Config-driven. Balanced random for v1. Defined in `matchmaking[].assignment` in YAML. Server assigns on match. |
| Matchmaking | Atomic match-and-assign (MongoDB findAndModify or transaction). No double-matching. Configurable `timeoutTarget` page in YAML. No backfill for v1. |
| No workspace (v1) | Live collaborative workspace is deferred. No WebSocket needed. |
| No Manager web UI (v1) | CLI-only. `pairit config upload`, `pairit config list`, `pairit data export`. |
| Recruitment | Prolific (already integrated) + direct links. `endRedirectUrl` for completion redirects. |
| Runtime | Bun |
| Frontend | React 19, Vite, TailwindCSS 4, TanStack Router |
| Backend | Elysia on Bun, MongoDB |
| Auth | Better Auth + Google OAuth. Optional for lab (per-config `requireAuth`). Required for manager. |
| Idempotency | All client POST endpoints (survey submissions, button clicks, events) require a client-generated UUID. Server deduplicates. No duplicate events in research data. |
| State writes | Field-level writes to `user_state`, not full document replacement. Concurrent writes from agent `assign_state`, surveys, and matchmaking must not clobber each other. |
| Agent errors | LLM timeout or failure → graceful error message in chat, failure persisted as event. Participant is never stuck on a frozen chat. |
| Session cleanup | Idle sessions timeout and are marked as abandoned. Matchmaking pool slots are released on session timeout or disconnect. |
| Single-server (v1) | In-memory SSE connections and matchmaking pool. Single server instance only. Documented constraint — do not deploy behind a load balancer without moving state to Redis. |
| Linting | Biome |
| Package conventions | `@pairit/{name}`, `workspace:*`, TypeScript strict |

---

## What Exists Today

Agents should build on top of the existing codebase, not rewrite it.

| Component | Status | What works |
|-----------|--------|------------|
| Lab app (React frontend) | Built | Pages, routing, surveys (single + paged), buttons, text, media. Runtime registry, config normalization, local/remote/hybrid modes. |
| Lab server (Elysia) | Built | `POST /sessions/start`, `GET /sessions/:id`, `POST /sessions/:id/advance`, `POST /sessions/:id/events`, `GET /configs/:configId`. Auth middleware (optional). |
| Manager server (Elysia) | Built | Config CRUD (upload, list, delete). Media upload/list/delete. Auth required. CLI loopback auth flow. |
| Manager CLI | Built | `pairit login`, `pairit config lint/compile/upload/list/delete`, `pairit media upload/list/delete`. |
| `@pairit/auth` | Built | Better Auth config with Google OAuth, MongoDB adapter. |
| `@pairit/db` | Built | MongoDB singleton connection with lazy init. |
| `@pairit/storage` | Built | Local filesystem + GCS backends. |
| Prolific integration | Built | Captures PROLIFIC_PID, STUDY_ID, SESSION_ID in session documents. |
| Expression evaluation | Partial | Basic branching works in routing context. Only needs: `<`, `>`, `<=`, `>=`, `==`, `!=`, `&&`, `||` on numbers, strings, booleans. |
| Docker + Cloud Run deployment | Built | Dockerfile.lab, Dockerfile.manager, cloudbuild configs, deploy scripts. |

### What does NOT exist yet

- SSE streaming
- Chat (backend or frontend)
- Matchmaking (backend or frontend)
- AI agent integration
- Agent tool use (`end_chat`, `assign_state`)
- Treatment assignment (writes to `user_state`)
- `pairit data export` CLI command
