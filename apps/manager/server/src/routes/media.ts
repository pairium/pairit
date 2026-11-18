/**
 * Media management routes for manager server
 * POST /media/upload - Upload media file
 * POST /media/upload-url - Signed URL for a large upload
 * GET /media - List media files
 * DELETE /media/:object - Delete media file
 *
 * Uploads go under the uploader's prefix (`${user.id}/`). Researchers list and
 * delete only their own objects; admins see and delete all. See media-keys.ts.
 */

import { Elysia, t } from "elysia";
import { authMiddleware } from "../lib/auth-middleware";
import {
	ALLOWED_CONTENT_TYPES_DESCRIPTION,
	contentTypeFor,
	deleteKey,
	isAllowedContentType,
	listPrefix,
	objectNameError,
	SIGNED_UPLOAD_DEFAULT_EXPIRY_SECONDS,
	SIGNED_UPLOAD_MAX_EXPIRY_SECONDS,
	SIGNED_UPLOAD_MIN_EXPIRY_SECONDS,
	signedUploadMaxBytes,
	uploadKey,
} from "../lib/media-keys";
import { storage } from "../lib/storage";
import type { MediaListItem } from "../types";

const DEFAULT_MEDIA_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const MEDIA_UPLOAD_MAX_BYTES = Number.isFinite(
	Number(process.env.MEDIA_UPLOAD_MAX_BYTES),
)
	? Number(process.env.MEDIA_UPLOAD_MAX_BYTES)
	: DEFAULT_MEDIA_UPLOAD_MAX_BYTES;

const PRIVATE_NOT_SUPPORTED = {
	error: "private_not_supported",
	message:
		"Private media is not supported. Anyone with an object's URL can read it, so do not upload sensitive files. Upload without --private.",
};

function estimateBase64Bytes(payload: string): number {
	const normalized = payload.replace(/\s/g, "");
	const padding = normalized.endsWith("==")
		? 2
		: normalized.endsWith("=")
			? 1
			: 0;
	return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

async function getPublicMediaUrl(object: string): Promise<string> {
	if (typeof storage.getPublicUrl === "function") {
		return storage.getPublicUrl(object);
	}
	return storage.getUrl(object);
}

type UploadTarget =
	| { ok: true; key: string; contentType: string }
	| { ok: false; status: number; body: { error: string; message: string } };

function resolveUploadTarget(
	userId: string,
	object: string,
	requestedContentType: string | null | undefined,
	isPublic: boolean | undefined,
): UploadTarget {
	if (isPublic === false) {
		return { ok: false, status: 400, body: PRIVATE_NOT_SUPPORTED };
	}
	const nameError = objectNameError(object);
	if (nameError) {
		return {
			ok: false,
			status: 400,
			body: { error: "invalid_object", message: nameError },
		};
	}
	const key = uploadKey(userId, object);
	const keyError = objectNameError(key);
	if (keyError) {
		return {
			ok: false,
			status: 400,
			body: { error: "invalid_object", message: keyError },
		};
	}
	const contentType = contentTypeFor(object, requestedContentType);
	if (contentType && !isAllowedContentType(contentType)) {
		return {
			ok: false,
			status: 400,
			body: {
				error: "unsupported_content_type",
				message: `Content type ${contentType} is not allowed. Allowed: ${ALLOWED_CONTENT_TYPES_DESCRIPTION}.`,
			},
		};
	}
	// Unknown types are stored as downloads, so a browser never renders them
	// as a page.
	return {
		ok: true,
		key,
		contentType: contentType ?? "application/octet-stream",
	};
}

export const mediaRoutes = new Elysia({ prefix: "/media" })
	.use(authMiddleware)
	.post(
		"/upload",
		async ({ body, set, user }) => {
			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

			const target = resolveUploadTarget(
				user.id,
				body.object,
				body.contentType,
				body.public,
			);
			if (!target.ok) {
				set.status = target.status;
				return target.body;
			}

			const estimatedBytes = estimateBase64Bytes(body.data);
			if (estimatedBytes > MEDIA_UPLOAD_MAX_BYTES) {
				set.status = 413;
				return {
					error: "payload_too_large",
					message: "Upload exceeds server limit; use signed upload instead.",
					maxBytes: MEDIA_UPLOAD_MAX_BYTES,
				};
			}

			let buffer: Buffer;
			try {
				buffer = Buffer.from(body.data, "base64");
			} catch (err) {
				console.error("media upload base64 decode error", err);
				set.status = 400;
				return {
					error: "invalid_data",
					message: "unable to decode base64 data",
				};
			}

			try {
				await storage.put(target.key, buffer, {
					contentType: target.contentType,
				});

				return {
					bucket: body.bucket || "local",
					object: target.key,
					size: buffer.length,
					contentType: target.contentType,
					updatedAt: new Date().toISOString(),
					checksum: null,
					publicUrl: await getPublicMediaUrl(target.key),
					metadata: body.metadata ?? null,
				};
			} catch (err) {
				console.error("media upload error", err);
				set.status = 500;
				return {
					error: "internal",
					message: err instanceof Error ? err.message : "unknown error",
				};
			}
		},
		{
			body: t.Object({
				object: t.String({ minLength: 1 }),
				data: t.String({ minLength: 1 }),
				checksum: t.Optional(t.String()),
				bucket: t.Optional(t.String()),
				contentType: t.Optional(t.Union([t.String(), t.Null()])),
				metadata: t.Optional(
					t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
				),
				public: t.Optional(t.Boolean()),
			}),
		},
	)
	.post(
		"/upload-url",
		async ({ body, set, user }) => {
			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

			if (typeof storage.getUploadUrl !== "function") {
				set.status = 400;
				return {
					error: "not_supported",
					message: "Signed uploads not supported by storage backend",
				};
			}

			const target = resolveUploadTarget(
				user.id,
				body.object,
				body.contentType,
				body.public,
			);
			if (!target.ok) {
				set.status = target.status;
				return target.body;
			}

			const maxBytes = signedUploadMaxBytes();
			try {
				const upload = await storage.getUploadUrl(target.key, {
					contentType: target.contentType,
					expiresInSeconds:
						body.expiresInSeconds ?? SIGNED_UPLOAD_DEFAULT_EXPIRY_SECONDS,
					maxBytes,
				});

				return {
					bucket: body.bucket || "local",
					object: target.key,
					uploadUrl: upload.url,
					method: upload.method,
					headers: upload.headers ?? null,
					expiresAt: upload.expiresAt ?? null,
					maxBytes,
					publicUrl: await getPublicMediaUrl(target.key),
				};
			} catch (err) {
				if (err instanceof Error && err.message === "not_supported") {
					set.status = 400;
					return {
						error: "not_supported",
						message: "Signed uploads not supported by storage backend",
					};
				}
				console.error("media upload-url error", err);
				set.status = 500;
				return {
					error: "internal",
					message: err instanceof Error ? err.message : "unknown error",
				};
			}
		},
		{
			body: t.Object({
				object: t.String({ minLength: 1 }),
				bucket: t.Optional(t.String()),
				contentType: t.Optional(t.Union([t.String(), t.Null()])),
				expiresInSeconds: t.Optional(
					t.Integer({
						minimum: SIGNED_UPLOAD_MIN_EXPIRY_SECONDS,
						maximum: SIGNED_UPLOAD_MAX_EXPIRY_SECONDS,
					}),
				),
				public: t.Optional(t.Boolean()),
			}),
		},
	)
	.get(
		"/",
		async ({ query, set, user, isAdmin }) => {
			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

			try {
				const files = await storage.list(
					listPrefix(user.id, isAdmin, query.prefix),
				);

				const objects: MediaListItem[] = await Promise.all(
					files.map(async (name: string) => ({
						name,
						bucket: "local",
						size: undefined,
						updatedAt: null,
						contentType: null,
						publicUrl: await getPublicMediaUrl(name),
						metadata: null,
					})),
				);

				return { objects };
			} catch (err) {
				console.error("media list error", err);
				set.status = 500;
				return {
					error: "internal",
					message: err instanceof Error ? err.message : "unknown error",
				};
			}
		},
		{
			query: t.Object({
				prefix: t.Optional(t.String()),
			}),
		},
	)
	.delete(
		"/:object",
		async ({ params: { object }, set, user, isAdmin }) => {
			if (!user) {
				set.status = 401;
				return { error: "unauthorized", message: "Not authenticated" };
			}

			const nameError = objectNameError(object);
			if (nameError) {
				set.status = 400;
				return { error: "invalid_object", message: nameError };
			}

			try {
				const key = deleteKey(user.id, isAdmin, object);
				if (!(await storage.exists(key))) {
					if (!isAdmin && key !== object && (await storage.exists(object))) {
						set.status = 403;
						return {
							error: "forbidden",
							message:
								"You can delete only media you uploaded. Media uploaded before per-researcher folders, or by another researcher, can be deleted by an admin.",
						};
					}
					set.status = 404;
					return { error: "not_found" };
				}

				await storage.delete(key);
				return { bucket: "local", object: key };
			} catch (err) {
				console.error("media delete error", err);
				set.status = 500;
				return {
					error: "internal",
					message: err instanceof Error ? err.message : "unknown error",
				};
			}
		},
		{
			params: t.Object({
				object: t.String(),
			}),
		},
	);
