# Storage

Firestore
- configs/{configId} → { publishedConfigId, owner, permissions, metadata, ...config, checksum }
- sessions/{sessionId} → { currentPageId, user_state, user_group, endedAt? }
- groups/{groupId} → shared group state
- events/{eventId} → audit events (assignments, matches, chat summaries)

RTDB
- chats/{chat_group_id} → chat messages
- matchmaking/{poolId} → queue entries (runtime-managed)

Notes
- Config documents store the canonical compiled JSON used at runtime; the checksum guards against accidental drift.
- Session documents record the current page and state snapshot so participants can reconnect safely.
- Group documents track shared fields (e.g., `chat_group_id`) that match the schema declared in `group_state`.
- Chat rooms stream message objects `{ id, text, role, senderId?, agentId?, timestamp }` for low-latency updates.

## Media

Using Firebase Storage. The manager service reads `PAIRIT_MEDIA_BUCKET` (defaults to `pairit-lab`) to decide which bucket to touch.

The bucket `gs://pairit-lab` is public so media uploaded from the CLI is immediately accessible:

```zsh
gcloud storage buckets add-iam-policy-binding gs://pairit-lab --member=allUsers --role=roles/storage.objectViewer
```

Manager endpoints (backed by Cloud Storage):

- `POST /media/upload` — accepts `{ bucket?, object, data (base64), contentType?, metadata?, public? }`. Files are made public by default; pass `"public": false` to keep private.
- `GET /media?bucket=&prefix=` — returns media objects (name, size, updatedAt, metadata) under the bucket.
- `DELETE /media/<path>?bucket=` — deletes the requested object.

Deployments must grant the Cloud Run/Functions service account `roles/storage.objectAdmin` on the bucket so it can upload, list, delete, and call `makePublic()`.
