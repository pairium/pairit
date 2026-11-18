/**
 * Media object keys and upload limits.
 *
 * Each researcher's uploads live under `${user.id}/`. A researcher can list,
 * overwrite, and delete only keys under their own prefix. Admins can list and
 * delete any key. Objects uploaded before per-researcher prefixes have no
 * owner prefix: they stay readable at their public URL, but only admins can
 * delete them.
 */

const OWNER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_OBJECT_NAME_LENGTH = 512;

export const SIGNED_UPLOAD_MIN_EXPIRY_SECONDS = 60;
export const SIGNED_UPLOAD_MAX_EXPIRY_SECONDS = 3600;
export const SIGNED_UPLOAD_DEFAULT_EXPIRY_SECONDS = 900;

const DEFAULT_SIGNED_UPLOAD_MAX_BYTES = 500 * 1024 * 1024;

export function signedUploadMaxBytes(): number {
	const fromEnv = Number(process.env.MEDIA_SIGNED_UPLOAD_MAX_BYTES);
	return Number.isFinite(fromEnv) && fromEnv > 0
		? Math.floor(fromEnv)
		: DEFAULT_SIGNED_UPLOAD_MAX_BYTES;
}

export function ownerPrefix(userId: string): string {
	if (!OWNER_ID_PATTERN.test(userId)) {
		throw new Error("user id cannot be used as a media prefix");
	}
	return `${userId}/`;
}

/** Returns an error message, or null when the name is acceptable. */
export function objectNameError(name: string): string | null {
	if (!name) return "object name is empty";
	if (name.length > MAX_OBJECT_NAME_LENGTH) {
		return `object name is longer than ${MAX_OBJECT_NAME_LENGTH} characters`;
	}
	// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
	if (/[\u0000-\u001f\u007f\\]/.test(name)) {
		return "object name contains a control character or backslash";
	}
	if (name.startsWith("/")) return "object name must not start with /";
	for (const segment of name.split("/")) {
		if (segment === "" || segment === "." || segment === "..") {
			return "object name has an empty, '.', or '..' path segment";
		}
	}
	return null;
}

/** The key an upload writes: always under the uploader's prefix. */
export function uploadKey(userId: string, object: string): string {
	const prefix = ownerPrefix(userId);
	return object.startsWith(prefix) ? object : `${prefix}${object}`;
}

/** The prefix a listing searches. Researchers only see their own objects. */
export function listPrefix(
	userId: string,
	isAdmin: boolean,
	requested = "",
): string {
	if (isAdmin) return requested;
	const prefix = ownerPrefix(userId);
	return requested.startsWith(prefix) ? requested : `${prefix}${requested}`;
}

/**
 * The key a delete targets. Admins delete the exact key. A researcher's name
 * is read inside their own prefix, so `media delete photo.png` deletes their
 * `${id}/photo.png`, never someone else's object or a legacy one.
 */
export function deleteKey(
	userId: string,
	isAdmin: boolean,
	object: string,
): string {
	if (isAdmin) return object;
	return uploadKey(userId, object);
}

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
	svg: "image/svg+xml",
	ico: "image/x-icon",
	bmp: "image/bmp",
	mp3: "audio/mpeg",
	wav: "audio/wav",
	ogg: "audio/ogg",
	oga: "audio/ogg",
	m4a: "audio/mp4",
	aac: "audio/aac",
	flac: "audio/flac",
	weba: "audio/webm",
	mp4: "video/mp4",
	m4v: "video/mp4",
	mov: "video/quicktime",
	webm: "video/webm",
	ogv: "video/ogg",
	pdf: "application/pdf",
	txt: "text/plain",
	csv: "text/csv",
	json: "application/json",
	vtt: "text/vtt",
	woff: "font/woff",
	woff2: "font/woff2",
	ttf: "font/ttf",
	otf: "font/otf",
};

const ALLOWED_CONTENT_TYPE =
	/^((image|audio|video|font)\/[A-Za-z0-9.+-]+|application\/(pdf|json|octet-stream)|text\/(plain|csv|vtt))$/;

export function isAllowedContentType(contentType: string): boolean {
	return ALLOWED_CONTENT_TYPE.test(contentType.trim().toLowerCase());
}

export const ALLOWED_CONTENT_TYPES_DESCRIPTION =
	"image/*, audio/*, video/*, font/*, application/pdf, application/json, application/octet-stream, text/plain, text/csv, text/vtt";

/** Content type for an object: the one given, else from its extension. */
export function contentTypeFor(
	object: string,
	given?: string | null,
): string | undefined {
	if (given?.trim()) return given.trim().toLowerCase();
	const ext = object.split(".").pop()?.toLowerCase();
	return ext && ext !== object.toLowerCase()
		? EXTENSION_CONTENT_TYPES[ext]
		: undefined;
}
