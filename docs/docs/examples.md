# Examples

Ready-to-use experiment templates. "Try it" runs the live demo; "Config" is the file to copy.

## Surveys and flow

Pages, questions and timing, no agents.

| Example | What it shows | |
|---|---|---|
| <span id="hello-world"></span>Hello World | The simplest experiment: one question, one button. | [Try it](https://pairit.pairium.ai/hello-world) · [Config](https://github.com/pairium/pairit/blob/main/configs/hello-world.yaml) |
| <span id="survey"></span>Survey | Multi-page survey with different question types. | [Try it](https://pairit.pairium.ai/survey-only) · [Config](https://github.com/pairium/pairit/blob/main/configs/survey-only.yaml) |
| <span id="randomization"></span>Randomization | Randomly assign participants to conditions using `onEnter` hooks. | [Try it](https://pairit.pairium.ai/randomization-demo) · [Config](https://github.com/pairium/pairit/blob/main/configs/randomization-demo.yaml) |
| <span id="timer"></span>Timer | Countdown timer with warning state and auto-navigation on expiry. | [Try it](https://pairit.pairium.ai/timer-demo) · [Config](https://github.com/pairium/pairit/blob/main/configs/timer-demo.yaml) |
| <span id="mermaid"></span>Mermaid | Render a diagram from a mermaid fence in a Text component. | [Try it](https://pairit.pairium.ai/mermaid-demo) · [Config](https://github.com/pairium/pairit/blob/main/configs/mermaid-demo.yaml) |
| <span id="component-events"></span>Component Events | Track custom analytics events on user interactions. | [Config](https://github.com/pairium/pairit/blob/main/configs/component-events.yaml) |

## AI agents

One participant talking with an AI agent.

| Example | What it shows | |
|---|---|---|
| <span id="ai-chat"></span>AI Chat | One-on-one conversation with an AI agent. | [Try it](https://pairit.pairium.ai/ai-chat) · [Config](https://github.com/pairium/pairit/blob/main/configs/ai-chat.yaml) |
| <span id="multi-chat"></span>Multi-Chat | Share or isolate chat history across pages using `groupId`. | [Try it](https://pairit.pairium.ai/multi-chat) · [Config](https://github.com/pairium/pairit/blob/main/configs/multi-chat.yaml) |
| <span id="agent-triggers"></span>Agent Triggers | Control when and whether agents reply using `trigger` and `replyCondition`. | [Try it](https://pairit.pairium.ai/agent-triggers) · [Config](https://github.com/pairium/pairit/blob/main/configs/agent-triggers.yaml) |
| <span id="conditional-agent"></span>Conditional Agent | Adapt agent prompts based on survey answers using conditional `prompts`. | [Try it](https://pairit.pairium.ai/conditional-agent) · [Config](https://github.com/pairium/pairit/blob/main/configs/conditional-agent.yaml) |
| <span id="split-layout"></span>Split Layout | Negotiate with an AI dealer while the car listing stays on screen beside the chat. | [Try it](https://pairit.pairium.ai/split-demo) · [Config](https://github.com/pairium/pairit/blob/main/configs/split-demo.yaml) |

## Groups

Matched participants together, with or without an agent. Open two tabs to play both partners.

| Example | What it shows | |
|---|---|---|
| <span id="team-decision"></span>Team Decision | Match 2 participants and let them chat together. | [Try it](https://pairit.pairium.ai/team-decision) · [Config](https://github.com/pairium/pairit/blob/main/configs/team-decision.yaml) |
| <span id="fruit-split"></span>Fruit Split | Give each matched partner a different role with `distribute: true`: one gets apples, the other oranges. | [Try it](https://pairit.pairium.ai/fruit-split-demo) · [Config](https://github.com/pairium/pairit/blob/main/configs/fruit-split-demo.yaml) |
| <span id="ai-mediation"></span>AI Mediation | Two participants chat with an AI facilitator observing and guiding. | [Try it](https://pairit.pairium.ai/ai-mediation) · [Config](https://github.com/pairium/pairit/blob/main/configs/ai-mediation.yaml) |

## Live workspace

A live document that participants and agents edit at the same time.

| Example | What it shows | |
|---|---|---|
| <span id="workspace"></span>Workspace | A participant and an AI agent edit one document; the agent makes targeted edits while the participant types. | [Try it](https://pairit.pairium.ai/workspace) · [Config](https://github.com/pairium/pairit/blob/main/configs/workspace.yaml) |
| <span id="shared-workspace"></span>Shared workspace | Two matched participants and an AI agent edit one document at the same time, then fill in a shared form. | [Try it](https://pairit.pairium.ai/workspace-group-plpgp7u9r2) · [Config](https://github.com/pairium/pairit/blob/main/configs/workspace-group.yaml) |
| <span id="workspace-board"></span>Workspace board | Tic-tac-toe on a JSON workspace drawn by a custom renderer: the participant clicks, the agent answers by editing the file. | [Try it](https://pairit.pairium.ai/workspace-board-2v1vs7xk0l) · [Config](https://github.com/pairium/pairit/blob/main/configs/workspace-board.yaml) |

## Custom UI

Your own HTML, in a locked-down frame.

| Example | What it shows | |
|---|---|---|
| <span id="html"></span>HTML | Custom slider UI uploaded with the config. | [Try it](https://pairit.pairium.ai/html-demo) · [Config](https://github.com/pairium/pairit/blob/main/configs/html-demo.yaml) |
