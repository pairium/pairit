import { Elysia } from "elysia";
import { authMiddleware } from "../lib/auth-middleware";

export const meRoutes = new Elysia()
	.use(authMiddleware)
	.get("/me", ({ user, isAdmin, set }) => {
		if (!user) {
			set.status = 401;
			return { error: "unauthorized", message: "Not authenticated" };
		}
		return {
			id: user.id,
			email: user.email,
			isAdmin,
		};
	});
