# Running Large Studies

Pairit handles about **100 participants active at the same time**. Total participants per study are not limited. What counts is how many people are mid-experiment at once.

Above that, pages may load slowly. Matchmaking and chat are the most sensitive to it. If you plan a study with more concurrent participants, contact the Pairit team before you launch.

## Limit how many people arrive at once

- On Prolific, release places in batches instead of all at once. For example, release 50, then the next 50 when most of the first batch have finished.
- Avoid sending one link to a large class or panel at a set start time. Everyone starts together, and that is the heaviest load.

## Matchmaking studies

- Set `timeoutSeconds` to how quickly participants actually arrive. If you release 20 places for a 3-person group, people may wait several minutes for the third member.
- Always set a `timeoutTarget`, so participants who are not matched still get a solo page or an exit survey.
- Pilot with a small batch, then check how long people waited using `wait_duration_seconds` on the `onMatchFound` and `onTimeout` events.

## Tell the Pairit team when a study is live

Updates to Pairit can briefly interrupt matchmaking and chat. Let the team know when a multi-participant study (matchmaking, chat, or workspace) is running, so updates wait until it ends.
