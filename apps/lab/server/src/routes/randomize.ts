/**
 * Randomization Routes
 * POST /sessions/:id/randomize - Assign treatment without matchmaking
 */

import { Elysia, t } from "elysia";
import { getGroupsCollection, getSessionsCollection } from "../lib/db";
import {
	assignTreatment,
	distributeConditions,
} from "../lib/treatment-assignment";
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
			distribute = false,
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

		if (distribute && scope !== "group") {
			set.status = 400;
			return {
				error: "distribute_requires_group_scope",
				message: "distribute: true only works with scope: group.",
			};
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

			if (distribute) {
				// Each member gets a different entry from conditions
				const groupsCollection = await getGroupsCollection();
				const group = await groupsCollection.findOne(
					{ groupId },
					{ projection: { memberSessionIds: 1, distributions: 1 } },
				);
				if (!group) {
					set.status = 400;
					return {
						error: "group_not_found",
						message: `Group ${groupId} does not exist.`,
					};
				}

				let distribution = group.distributions?.[stateKey];
				const existing = Boolean(distribution);
				if (!distribution) {
					let candidate: Record<string, string>;
					try {
						candidate = distributeConditions(
							conditions,
							group.memberSessionIds,
						);
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						console.error(`[Randomize] Group ${groupId}: ${message}`);
						set.status = 400;
						return { error: "group_size_mismatch", message };
					}

					// Claim the distribution on the group document so members
					// randomizing at the same time all use the first writer's
					const distributionPath = `distributions.${stateKey}`;
					await groupsCollection.updateOne(
						{ groupId, [distributionPath]: { $exists: false } },
						{ $set: { [distributionPath]: candidate } },
					);
					const claimed = await groupsCollection.findOne(
						{ groupId },
						{ projection: { distributions: 1 } },
					);
					distribution = claimed?.distributions?.[stateKey] ?? candidate;

					await sessionsCollection.bulkWrite(
						Object.entries(distribution).map(([sid, value]) => ({
							updateOne: {
								filter: { id: sid },
								update: {
									$set: {
										[`session_state.${stateKey}`]: value,
										updatedAt: new Date(),
									},
								},
							},
						})),
					);

					console.log(
						`[Randomize] Group ${groupId} distributed ${stateKey}: ${JSON.stringify(distribution)}`,
					);
				}

				const condition = distribution[id];
				if (!condition) {
					set.status = 400;
					return {
						error: "not_in_group",
						message: `Session ${id} is not a member of group ${groupId}.`,
					};
				}
				return { condition, existing };
			}

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
			const candidate = await assignTreatment(
				balanceKey,
				conditions,
				assignmentType,
				session.simulated === true,
			);

			// Claim the assignment on the group document so members randomizing
			// at the same time all end up with the first writer's condition
			const assignmentPath = `assignments.${stateKey}`;
			const groupsCollection = await getGroupsCollection();
			await groupsCollection.updateOne(
				{ groupId, [assignmentPath]: { $exists: false } },
				{ $set: { [assignmentPath]: candidate } },
			);
			const group = await groupsCollection.findOne(
				{ groupId },
				{ projection: { assignments: 1 } },
			);
			// Groups always exist after matchmaking; fall back if one is missing
			const treatment = group?.assignments?.[stateKey] ?? candidate;

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
			session.simulated === true,
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
			distribute: t.Optional(t.Boolean()),
		}),
	},
);
