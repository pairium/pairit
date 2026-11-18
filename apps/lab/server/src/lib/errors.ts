import { Elysia } from "elysia";

/**
 * Unexpected errors are logged, not returned: their messages can carry file
 * paths, database details or other internals. Validation, parse and
 * not-found errors keep Elysia's own responses.
 */
export const hideInternalErrors = new Elysia({
	name: "hide-internal-errors",
}).onError({ as: "global" }, ({ code, error, set }) => {
	if (code !== "UNKNOWN" && code !== "INTERNAL_SERVER_ERROR") return;
	console.error("[Server] Unhandled error:", error);
	set.status = 500;
	return { error: "internal_error" };
});
