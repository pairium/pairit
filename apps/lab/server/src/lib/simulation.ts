export type SimulationFields = {
	simulated?: boolean;
	simulationRunId?: string;
	personaId?: string;
};

export function resolveSimulationFields(input: {
	simulated?: boolean;
	simulationRunId?: string;
	personaId?: string;
	prolificPid?: string | null;
}): SimulationFields {
	const simulated =
		input.simulated === true ||
		(input.prolificPid?.startsWith("sim-") ?? false);
	if (!simulated) return {};
	return {
		simulated: true,
		...(input.simulationRunId
			? { simulationRunId: input.simulationRunId }
			: {}),
		...(input.personaId ? { personaId: input.personaId } : {}),
	};
}
