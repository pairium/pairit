/**
 * Config management routes for manager server
 * POST /configs/upload - Upload a config by name (new revision on change)
 * GET /configs - List configs (filterable by owner)
 * GET /configs/:configId/revisions - List revisions
 * GET /configs/:configId/revisions/:revision - Get one revision's config
 * DELETE /configs/:configId - Delete config
 */
import { Elysia, t } from "elysia";
import { MongoServerError } from "mongodb";
import { authMiddleware } from "../lib/auth-middleware";
import {
	generateConfigId,
	nextRevision,
	revisionSessionFilter,
} from "../lib/config-identity";
import {
	getConfigRevisionsCollection,
	getConfigsCollection,
	getSessionsCollection,
} from "../lib/db";
import {
	encryptLlmCredentials,
	maskConfiguredCredentials,
} from "../lib/llm-credentials";
import type { ConfigDocument, ConfigRevisionDocument } from "../types";

const MAX_NEW_ID_ATTEMPTS = 3;

function isDuplicateKey(err: unknown, field: string): boolean {
	return (
		err instanceof MongoServerError &&
		err.code === 11000 &&
		Object.hasOwn(err.keyPattern ?? {}, field)
	);
}

/**
 * Save a revision snapshot. Retrying the same upload is a no-op; a different
 * config at an existing revision fails on the unique {configId, revision} index.
 */
async function saveRevision(doc: ConfigRevisionDocument): Promise<void> {
	const revisions = await getConfigRevisionsCollection();
	await revisions.updateOne(
		{ configId: doc.configId, revision: doc.revision, checksum: doc.checksum },
		{ $setOnInsert: doc },
		{ upsert: true },
	);
}

function toIso(value: unknown): string | null {
	return value instanceof Date ? value.toISOString() : null;
}

export const configsRoutes = new Elysia({ prefix: "/configs" })
	.use(authMiddleware)
	.post(
		"/upload",
		async (context) => {
			const { body, set, user, isAdmin } = context;

			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

			const name = body.name?.trim() || undefined;
			if (!name && !body.configId) {
				set.status = 400;
				return {
					error: "name_required",
					message: "Upload needs a config name (--name).",
				};
			}

			try {
				const collection = await getConfigsCollection();

				// Find the config this upload updates, if any
				let existing: ConfigDocument | null;
				if (body.configId) {
					existing = await collection.findOne({ configId: body.configId });
					// Ownership check: prevent overwriting another user's config
					if (existing && existing.owner !== user.id) {
						set.status = 403;
						return {
							error: "forbidden",
							message: "Cannot modify config owned by another user",
						};
					}
					// Only admins may claim a fixed configId (e.g. docs examples)
					if (!existing && !isAdmin) {
						set.status = 400;
						return {
							error: "name_required",
							message:
								"New configs are created by name. Use --name instead of --config-id (pairit 0.3.0 or later).",
						};
					}
				} else {
					existing = await collection.findOne({ owner: user.id, name });
				}

				const plan = nextRevision(existing, body.checksum);
				const now = new Date();
				const snapshot = (
					revision: number,
				): Omit<ConfigRevisionDocument, "configId"> => ({
					revision,
					checksum: body.checksum,
					config: body.config,
					metadata: body.metadata ?? null,
					requireAuth: body.requireAuth ?? true,
					allowRetake: body.allowRetake ?? false,
					uploadedBy: user.id,
					createdAt: now,
				});

				const encryptedCredentials = encryptLlmCredentials(body.llmCredentials);
				const payload: Partial<ConfigDocument> = {
					owner: user.id, // Auto-populate from authenticated user
					...(name && { name }),
					revision: plan.revision,
					checksum: body.checksum,
					metadata: body.metadata ?? null,
					config: body.config,
					...(encryptedCredentials && { llmCredentials: encryptedCredentials }),
					requireAuth: body.requireAuth ?? true, // Default to true
					allowRetake: body.allowRetake ?? false, // Default to false
					updatedAt: now,
				};

				let configId: string;
				if (existing) {
					configId = existing.configId;
					// Snapshots go first: the unique {configId, revision} index stops
					// two concurrent uploads from claiming the same revision.
					if (plan.archiveLegacy) {
						await saveRevision({
							configId,
							revision: 1,
							checksum: existing.checksum ?? null,
							config: existing.config,
							metadata: existing.metadata ?? null,
							requireAuth: existing.requireAuth ?? true,
							allowRetake: existing.allowRetake ?? false,
							uploadedBy: existing.owner ?? null,
							createdAt: existing.updatedAt ?? existing.createdAt ?? now,
						});
					}
					if (plan.bumped) {
						await saveRevision({ configId, ...snapshot(plan.revision) });
					}
					await collection.updateOne({ configId }, { $set: payload });
				} else {
					configId = body.configId ?? "";
					for (let attempt = 0; ; attempt++) {
						if (!body.configId) configId = generateConfigId(name ?? "config");
						try {
							await collection.insertOne({
								...payload,
								configId,
								createdAt: now,
							} as ConfigDocument);
							break;
						} catch (err) {
							const retry =
								!body.configId &&
								attempt + 1 < MAX_NEW_ID_ATTEMPTS &&
								isDuplicateKey(err, "configId");
							if (!retry) throw err;
						}
					}
					await saveRevision({ configId, ...snapshot(1) });
				}

				// How many real participants ran the revision this upload replaced
				let previousRevision: number | null = null;
				let previousRevisionSessionCount = 0;
				if (existing && plan.bumped) {
					previousRevision = plan.revision - 1;
					const sessions = await getSessionsCollection();
					previousRevisionSessionCount = await sessions.countDocuments({
						configId,
						simulated: { $ne: true },
						configRevision: revisionSessionFilter(previousRevision),
					});
				}

				const updated = await collection.findOne({ configId });
				return {
					configId,
					name: updated?.name ?? null,
					revision: plan.revision,
					created: !existing,
					previousRevision,
					previousRevisionSessionCount,
					owner: updated?.owner ?? user.id,
					checksum: updated?.checksum ?? body.checksum,
					metadata: updated?.metadata ?? null,
					llmCredentials: maskConfiguredCredentials(updated?.llmCredentials),
					requireAuth: updated?.requireAuth ?? true,
					allowRetake: updated?.allowRetake ?? false,
					updatedAt: toIso(updated?.updatedAt),
					createdAt: toIso(updated?.createdAt),
				};
			} catch (err) {
				if (isDuplicateKey(err, "revision") || isDuplicateKey(err, "name")) {
					set.status = 409;
					return {
						error: "conflict",
						message:
							"Another upload of this config finished first. Run the upload again.",
					};
				}
				console.error("upload error", err);
				set.status = 500;
				return {
					error: "internal",
					message: err instanceof Error ? err.message : "unknown error",
				};
			}
		},
		{
			body: t.Object({
				name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
				configId: t.Optional(t.String({ minLength: 1 })),
				checksum: t.String({ minLength: 1 }),
				metadata: t.Optional(
					t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
				),
				config: t.Unknown(),
				llmCredentials: t.Optional(
					t.Object({
						openaiApiKey: t.Optional(t.String({ minLength: 1 })),
						anthropicApiKey: t.Optional(t.String({ minLength: 1 })),
					}),
				),
				requireAuth: t.Optional(t.Boolean()),
				allowRetake: t.Optional(t.Boolean()),
			}),
		},
	)
	.get(
		"/",
		async ({ set, user }) => {
			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

			try {
				const collection = await getConfigsCollection();
				// Ownership filter: only show configs owned by authenticated user
				// The owner query param is ignored - always filter by authenticated user
				const cursor = collection
					.find({ owner: user.id })
					.sort({ updatedAt: -1 });

				const items = await cursor.toArray();
				const configs = items.map((data) => ({
					configId: data.configId,
					name: data.name ?? null,
					revision: data.revision ?? null,
					owner: data.owner,
					checksum: data.checksum,
					updatedAt:
						data.updatedAt instanceof Date
							? data.updatedAt.toISOString()
							: null,
					metadata: data.metadata ?? null,
					llmCredentials: maskConfiguredCredentials(data.llmCredentials),
				}));

				return { configs };
			} catch (err) {
				console.error("list error", err);
				set.status = 500;
				return {
					error: "internal",
					message: err instanceof Error ? err.message : "unknown error",
				};
			}
		},
		{
			query: t.Object({
				owner: t.Optional(t.String()),
			}),
		},
	)
	.get(
		"/:configId/revisions",
		async ({ params: { configId }, set, user }) => {
			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

			const config = await (await getConfigsCollection()).findOne({ configId });
			if (!config) {
				set.status = 404;
				return { error: "not_found" };
			}
			if (config.owner !== user.id) {
				set.status = 403;
				return { error: "forbidden", message: "Access denied" };
			}

			const revisions = await (await getConfigRevisionsCollection())
				.find({ configId }, { projection: { config: 0 } })
				.sort({ revision: 1 })
				.toArray();

			const sessions = await getSessionsCollection();
			const sessionCounts = await Promise.all(
				revisions.map((r) =>
					sessions.countDocuments({
						configId,
						simulated: { $ne: true },
						configRevision: revisionSessionFilter(r.revision),
					}),
				),
			);

			return {
				configId,
				name: config.name ?? null,
				currentRevision: config.revision ?? null,
				revisions: revisions.map((r, i) => ({
					revision: r.revision,
					checksum: r.checksum,
					uploadedBy: r.uploadedBy,
					createdAt: toIso(r.createdAt),
					sessionCount: sessionCounts[i],
				})),
			};
		},
		{ params: t.Object({ configId: t.String() }) },
	)
	.get(
		"/:configId/revisions/:revision",
		async ({ params: { configId, revision }, set, user }) => {
			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

			const config = await (await getConfigsCollection()).findOne({ configId });
			if (!config) {
				set.status = 404;
				return { error: "not_found" };
			}
			if (config.owner !== user.id) {
				set.status = 403;
				return { error: "forbidden", message: "Access denied" };
			}

			const doc = await (await getConfigRevisionsCollection()).findOne({
				configId,
				revision,
			});
			if (!doc) {
				set.status = 404;
				return { error: "not_found" };
			}
			return {
				configId,
				revision: doc.revision,
				checksum: doc.checksum,
				metadata: doc.metadata,
				requireAuth: doc.requireAuth,
				allowRetake: doc.allowRetake,
				createdAt: toIso(doc.createdAt),
				config: doc.config,
			};
		},
		{
			params: t.Object({
				configId: t.String(),
				revision: t.Numeric({ minimum: 1 }),
			}),
		},
	)
	.delete(
		"/:configId",
		async ({ params: { configId }, set, user }) => {
			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

			try {
				const collection = await getConfigsCollection();
				const existing = await collection.findOne({ configId });
				if (!existing) {
					set.status = 404;
					return { error: "not_found" };
				}

				// Ownership check: only allow deleting own configs
				if (existing.owner !== user.id) {
					set.status = 403;
					return {
						error: "forbidden",
						message: "Cannot delete config owned by another user",
					};
				}

				await collection.deleteOne({ configId });
				// Sessions keep their own copy of the config they ran
				await (await getConfigRevisionsCollection()).deleteMany({ configId });
				return { configId };
			} catch (err) {
				console.error("delete error", err);
				set.status = 500;
				return {
					error: "internal",
					message: err instanceof Error ? err.message : "unknown error",
				};
			}
		},
		{
			params: t.Object({
				configId: t.String(),
			}),
		},
	);
