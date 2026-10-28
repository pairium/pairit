/**
 * Turns an error Elysia caught into the response the manager sends.
 * Elysia's own errors carry their status (404 for an unknown route, 422 for a
 * body that fails validation); anything else is a 500.
 */

type ErrorContext = {
	code: string | number;
	error: unknown;
	set: { status?: number | string };
};

export function errorStatus(error: unknown): number {
	if (typeof error === "object" && error !== null && "status" in error) {
		const status = (error as { status: unknown }).status;
		if (typeof status === "number" && status >= 400 && status < 600) {
			return status;
		}
	}
	return 500;
}

export function errorResponse({ code, error, set }: ErrorContext) {
	const status = errorStatus(error);
	if (status >= 500) {
		console.error(`[Elysia Error] ${code}:`, error);
	}
	set.status = status;
	const message = error instanceof Error ? error.message : "Unknown error";
	return {
		status: "error",
		code,
		message,
	};
}
