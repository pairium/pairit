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

		const {
			assignmentType = "random",
			conditions = [],
			stateKey = "treatment",
			scope = "session",
		} = body;

		// Validate stateKey to prevent MongoDB operator injection
		if (
			stateKey.includes("$") ||
			stateKey.startsWith(".") ||
			stateKey.endsWith(".")
		) {
			set.status = 400;
			return { error: "invalid_state_key" };
		}

		// Idempotent: return existing assignment if present
		const existingValue = session.session_state?.[stateKey];
		if (existingValue) {
			return {
				condition: existingValue as string,
				existing: true,
			};
		}

		if (scope === "group") {
			// Group-level randomization: all members get the same treatment
			const groupId = session.session_state?.group_id as string | undefined;
			if (!groupId) {
				set.status = 400;
				return {
					error: "no_group",
					message:
						"Session has no group_id in session_state. Group-scoped randomization requires matchmaking first.",
				};
			}

			const sessionsCollection = await getSessionsCollection();

			// Check if any group member already has an assignment
			const existingMember = await sessionsCollection.findOne({
				"session_state.group_id": groupId,
				[`session_state.${stateKey}`]: { $exists: true, $ne: null },
			});

			if (existingMember) {
				const existingCondition = existingMember.session_state?.[
					stateKey
				] as string;

				// Ensure this session also has the assignment
				await sessionsCollection.updateOne(
					{ id },
					{
						$set: {
							[`session_state.${stateKey}`]: existingCondition,
							updatedAt: new Date(),
						},
					},
				);

				return { condition: existingCondition, existing: true };
			}

			// No member has an assignment yet — assign and propagate to all members
			const balanceKey = `${session.configId}:${stateKey}:group`;
			const treatment = await assignTreatment(
				balanceKey,
				conditions,
				assignmentType,
			);

			await sessionsCollection.updateMany(
				{ "session_state.group_id": groupId },
				{
					$set: {
						[`session_state.${stateKey}`]: treatment,
						updatedAt: new Date(),
					},
				},
			);

			console.log(
				`[Randomize] Group ${groupId} assigned ${stateKey}: ${treatment} (strategy: ${assignmentType})`,
			);

			return { condition: treatment, existing: false };
		}

		// Session-level randomization (default)
		const balanceKey = `${session.configId}:${stateKey}`;
		const treatment = await assignTreatment(
			balanceKey,
			conditions,
			assignmentType,
		);

		// Persist treatment to session
		const sessionsCollection = await getSessionsCollection();
		await sessionsCollection.updateOne(
			{ id },
			{
				$set: {
					[`session_state.${stateKey}`]: treatment,
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
			scope: t.Optional(t.Union([t.Literal("session"), t.Literal("group")])),
		}),
	},
);
