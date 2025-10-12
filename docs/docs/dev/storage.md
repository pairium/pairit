# Storage

Firestore
- configs/{configId} → { publishedConfigId, owner, permissions, metadata, ...config, checksum }
- sessions/{sessionId} → { currentPageId, user_state, user_group, endedAt? }
- groups/{groupId} → shared group state

RTDB
- chats/{chat_group_id} → chat messages


