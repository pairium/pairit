# Examples

Ready-to-use experiment templates. Click an example to try it live, or open its config to copy.

## Surveys and flow

Pages, questions and timing, no agents.

| Example | What it shows | Config |
|---|---|---|
| <span id="hello-world"></span>[Hello World](https://pairit.pairium.ai/hello-world) | The simplest experiment: one question, one button. | [`hello-world.yaml`](https://github.com/pairium/pairit/blob/main/configs/hello-world.yaml) |
| <span id="survey"></span>[Survey](https://pairit.pairium.ai/survey-only) | Multi-page survey with different question types. | [`survey-only.yaml`](https://github.com/pairium/pairit/blob/main/configs/survey-only.yaml) |
| <span id="randomization"></span>[Randomization](https://pairit.pairium.ai/randomization-demo) | Randomly assign participants to conditions using `onEnter` hooks. | [`randomization-demo.yaml`](https://github.com/pairium/pairit/blob/main/configs/randomization-demo.yaml) |
| <span id="timer"></span>[Timer](https://pairit.pairium.ai/timer-demo) | Countdown timer with warning state and auto-navigation on expiry. | [`timer-demo.yaml`](https://github.com/pairium/pairit/blob/main/configs/timer-demo.yaml) |
| <span id="mermaid"></span>[Mermaid](https://pairit.pairium.ai/mermaid-demo) | Render a diagram from a mermaid fence in a Text component. | [`mermaid-demo.yaml`](https://github.com/pairium/pairit/blob/main/configs/mermaid-demo.yaml) |
| <span id="component-events"></span>Component Events | Track custom analytics events on user interactions. | [`component-events.yaml`](https://github.com/pairium/pairit/blob/main/configs/component-events.yaml) |

## AI agents

One participant talking with an AI agent.

| Example | What it shows | Config |
|---|---|---|
| <span id="ai-chat"></span>[AI Chat](https://pairit.pairium.ai/ai-chat) | One-on-one conversation with an AI agent. | [`ai-chat.yaml`](https://github.com/pairium/pairit/blob/main/configs/ai-chat.yaml) |
| <span id="multi-chat"></span>[Multi-Chat](https://pairit.pairium.ai/multi-chat) | Share or isolate chat history across pages using `groupId`. | [`multi-chat.yaml`](https://github.com/pairium/pairit/blob/main/configs/multi-chat.yaml) |
| <span id="agent-triggers"></span>[Agent Triggers](https://pairit.pairium.ai/agent-triggers) | Control when and whether agents reply using `trigger` and `replyCondition`. | [`agent-triggers.yaml`](https://github.com/pairium/pairit/blob/main/configs/agent-triggers.yaml) |
| <span id="conditional-agent"></span>[Conditional Agent](https://pairit.pairium.ai/conditional-agent) | Adapt agent prompts based on survey answers using conditional `prompts`. | [`conditional-agent.yaml`](https://github.com/pairium/pairit/blob/main/configs/conditional-agent.yaml) |
| <span id="split-layout"></span>[Split Layout](https://pairit.pairium.ai/split-demo) | Negotiate with an AI dealer while the car listing stays on screen beside the chat. | [`split-demo.yaml`](https://github.com/pairium/pairit/blob/main/configs/split-demo.yaml) |

## Groups

Matched participants together, with or without an agent. Open two tabs to play both partners.

| Example | What it shows | Config |
|---|---|---|
| <span id="team-decision"></span>[Team Decision](https://pairit.pairium.ai/team-decision) | Match 2 participants and let them chat together. | [`team-decision.yaml`](https://github.com/pairium/pairit/blob/main/configs/team-decision.yaml) |
| <span id="fruit-split"></span>[Fruit Split](https://pairit.pairium.ai/fruit-split-demo) | Give each matched partner a different role with `distribute: true`: one gets apples, the other oranges. | [`fruit-split-demo.yaml`](https://github.com/pairium/pairit/blob/main/configs/fruit-split-demo.yaml) |
| <span id="ai-mediation"></span>[AI Mediation](https://pairit.pairium.ai/ai-mediation) | Two participants chat with an AI facilitator observing and guiding. | [`ai-mediation.yaml`](https://github.com/pairium/pairit/blob/main/configs/ai-mediation.yaml) |

## Live workspace

A live document that participants and agents edit at the same time.

| Example | What it shows | Config |
|---|---|---|
| <span id="workspace"></span>[Workspace](https://pairit.pairium.ai/workspace) | A participant and an AI agent edit one document; the agent makes targeted edits while the participant types. | [`workspace.yaml`](https://github.com/pairium/pairit/blob/main/configs/workspace.yaml) |
| <span id="shared-workspace"></span>[Shared workspace](https://pairit.pairium.ai/workspace-group-plpgp7u9r2) | Two matched participants and an AI agent edit one document at the same time, then fill in a shared form. | [`workspace-group.yaml`](https://github.com/pairium/pairit/blob/main/configs/workspace-group.yaml) |
| <span id="workspace-board"></span>[Workspace board](https://pairit.pairium.ai/workspace-board-2v1vs7xk0l) | Tic-tac-toe on a JSON workspace drawn by a custom renderer: the participant clicks, the agent answers by editing the file. | [`workspace-board.yaml`](https://github.com/pairium/pairit/blob/main/configs/workspace-board.yaml) |

## Custom UI

Your own HTML, in a locked-down frame.

| Example | What it shows | Config |
|---|---|---|
| <span id="html"></span>[HTML](https://pairit.pairium.ai/html-demo) | Custom slider UI uploaded with the config. | [`html-demo.yaml`](https://github.com/pairium/pairit/blob/main/configs/html-demo.yaml) |
