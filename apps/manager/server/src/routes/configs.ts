/**
 * Config management routes for manager server
 * POST /configs/upload - Upload/update config
 * GET /configs - List configs (filterable by owner)
 * DELETE /configs/:configId - Delete config
 */
import {
	ConfigParseError,
	ConfigValidationError,
	compileYaml,
} from "@pairit/config-compiler";
import { Elysia, t } from "elysia";
import { authMiddleware } from "../lib/auth-middleware";
import { getConfigsCollection } from "../lib/db";
import {
	encryptLlmCredentials,
	maskConfiguredCredentials,
} from "../lib/llm-credentials";
import type { ConfigDocument } from "../types";

export const configsRoutes = new Elysia({ prefix: "/configs" })
	.use(authMiddleware)
	.post(
		"/upload",
		async (context) => {
			const { body, set, user } = context;

			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

			try {
				const collection = await getConfigsCollection();
				const existing = await collection.findOne({ configId: body.configId });

				// Ownership check: prevent overwriting another user's config
				if (existing && existing.owner !== user.id) {
					set.status = 403;
					return {
						error: "forbidden",
						message: "Cannot modify config owned by another user",
					};
				}

				const encryptedCredentials = encryptLlmCredentials(body.llmCredentials);
				const payload: Partial<ConfigDocument> = {
					configId: body.configId,
					owner: user.id, // Auto-populate from authenticated user
					checksum: body.checksum,
					metadata: body.metadata ?? null,
					config: body.config,
					rawYaml: body.rawYaml ?? null,
					...(encryptedCredentials && { llmCredentials: encryptedCredentials }),
					requireAuth: body.requireAuth ?? true, // Default to true
					allowRetake: body.allowRetake ?? false, // Default to false
					updatedAt: new Date(),
				};

				if (!existing) {
					payload.createdAt = new Date();
				}

				await collection.updateOne(
					{ configId: body.configId },
					{ $set: payload },
					{ upsert: true },
				);

				const updated = await collection.findOne({ configId: body.configId });
				return {
					configId: updated?.configId ?? body.configId,
					owner: updated?.owner ?? user.id,
					checksum: updated?.checksum ?? body.checksum,
					metadata: updated?.metadata ?? null,
					llmCredentials: maskConfiguredCredentials(updated?.llmCredentials),
					requireAuth: updated?.requireAuth ?? true,
					allowRetake: updated?.allowRetake ?? false,
					updatedAt:
						updated?.updatedAt instanceof Date
							? updated.updatedAt.toISOString()
							: null,
					createdAt:
						updated?.createdAt instanceof Date
							? updated.createdAt.toISOString()
							: null,
				};
			} catch (err) {
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
				configId: t.String({ minLength: 1 }),
				checksum: t.String({ minLength: 1 }),
				metadata: t.Optional(
					t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
				),
				config: t.Unknown(),
				rawYaml: t.Optional(t.String()),
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
	.post(
		"/yaml",
		async (context) => {
			const { body, set, user } = context;
			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

			let compiled: ReturnType<typeof compileYaml>;
			try {
				compiled = compileYaml(body.yaml);
			} catch (err) {
				set.status = 400;
				if (err instanceof ConfigParseError) {
					return { error: "parse_error", message: err.message };
				}
				if (err instanceof ConfigValidationError) {
					return { error: "validation_error", message: err.message };
				}
				return {
					error: "compile_error",
					message: err instanceof Error ? err.message : "unknown error",
				};
			}

			try {
				const collection = await getConfigsCollection();
				const configId = body.configId ?? compiled.defaultConfigId;
				const existing = await collection.findOne({ configId });
				if (existing && existing.owner !== user.id) {
					set.status = 403;
					return {
						error: "forbidden",
						message: "Cannot modify config owned by another user",
					};
				}

				const encryptedCredentials = encryptLlmCredentials(body.llmCredentials);
				const payload: Partial<ConfigDocument> = {
					configId,
					owner: user.id,
					checksum: compiled.checksum,
					metadata: body.metadata ?? existing?.metadata ?? null,
					config: compiled.config,
					rawYaml: body.yaml,
					...(encryptedCredentials && { llmCredentials: encryptedCredentials }),
					requireAuth: compiled.requireAuth ?? existing?.requireAuth ?? true,
					allowRetake: compiled.allowRetake,
					updatedAt: new Date(),
				};
				if (!existing) payload.createdAt = new Date();

				await collection.updateOne(
					{ configId },
					{ $set: payload },
					{ upsert: true },
				);

				const updated = await collection.findOne({ configId });
				return {
					configId: updated?.configId ?? configId,
					owner: updated?.owner ?? user.id,
					checksum: updated?.checksum ?? compiled.checksum,
					metadata: updated?.metadata ?? null,
					rawYaml: updated?.rawYaml ?? body.yaml,
					llmCredentials: maskConfiguredCredentials(updated?.llmCredentials),
					requireAuth: updated?.requireAuth ?? true,
					allowRetake: updated?.allowRetake ?? false,
					updatedAt:
						updated?.updatedAt instanceof Date
							? updated.updatedAt.toISOString()
							: null,
					createdAt:
						updated?.createdAt instanceof Date
							? updated.createdAt.toISOString()
							: null,
				};
			} catch (err) {
				console.error("yaml upload error", err);
				set.status = 500;
				return {
					error: "internal",
					message: err instanceof Error ? err.message : "unknown error",
				};
			}
		},
		{
			body: t.Object({
				configId: t.Optional(t.String({ minLength: 1 })),
				yaml: t.String({ minLength: 1 }),
				metadata: t.Optional(
					t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
				),
				llmCredentials: t.Optional(
					t.Object({
						openaiApiKey: t.Optional(t.String({ minLength: 1 })),
						anthropicApiKey: t.Optional(t.String({ minLength: 1 })),
					}),
				),
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
		"/:configId",
		async ({ params: { configId }, set, user }) => {
			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

			try {
				const collection = await getConfigsCollection();
				const data = await collection.findOne({ configId });
				if (!data) {
					set.status = 404;
					return { error: "not_found" };
				}
				if (data.owner !== user.id) {
					set.status = 403;
					return {
						error: "forbidden",
						message: "Not authorized to view this config",
					};
				}

				return {
					configId: data.configId,
					owner: data.owner,
					checksum: data.checksum,
					metadata: data.metadata ?? null,
					config: data.config,
					rawYaml: data.rawYaml ?? null,
					llmCredentials: maskConfiguredCredentials(data.llmCredentials),
					requireAuth: data.requireAuth ?? true,
					allowRetake: data.allowRetake ?? false,
					createdAt:
						data.createdAt instanceof Date
							? data.createdAt.toISOString()
							: null,
					updatedAt:
						data.updatedAt instanceof Date
							? data.updatedAt.toISOString()
							: null,
				};
			} catch (err) {
				console.error("get error", err);
				set.status = 500;
				return {
					error: "internal",
					message: err instanceof Error ? err.message : "unknown error",
				};
			}
		},
		{
			params: t.Object({ configId: t.String() }),
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
