/**
 * Randomization Routes
 * POST /sessions/:id/randomize - Assign treatment without matchmaking
 */

import { Elysia, t } from "elysia";
import { getSessionsCollection } from "../lib/db";
import { assignTreatment } from "../lib/treatment-assignment";
import { loadSession } from "./sessions";

export const randomizeRoutes = new Elysia({ prefix: "/sessions" }).post(
	"/:id/randomize",
	async ({ params: { id }, body, set }) => {
		// Verify session exists
		const session = await loadSession(id);
		if (!session) {
			set.status = 404;
			return { error: "session_not_found" };
		}

		const { assignmentType = "random", conditions = [], stateKey = "treatment" } = body;

		// Idempotent: return existing assignment if present
		const existingValue = session.user_state?.[stateKey];
		if (existingValue) {
			return {
				condition: existingValue as string,
				existing: true,
			};
		}

		// Use configId + stateKey as balance key (allows separate balance per key)
		const balanceKey = `${session.configId}:${stateKey}`;
		const treatment = assignTreatment(balanceKey, conditions, assignmentType);

		// Persist treatment to session
		const sessionsCollection = await getSessionsCollection();
		await sessionsCollection.updateOne(
			{ id },
			{
				$set: {
					[`user_state.${stateKey}`]: treatment,
					updatedAt: new Date(),
				},
			},
		);

		console.log(
			`[Randomize] Session ${id} assigned ${stateKey}: ${treatment} (strategy: ${assignmentType})`,
		);

		return {
			condition: treatment,
			existing: false,
		};
	},
	{
		params: t.Object({ id: t.String() }),
		body: t.Object({
			assignmentType: t.Optional(
				t.Union([
					t.Literal("random"),
					t.Literal("balanced_random"),
					t.Literal("block"),
				]),
			),
			conditions: t.Optional(t.Array(t.String())),
			stateKey: t.Optional(t.String()),
		}),
	},
);
