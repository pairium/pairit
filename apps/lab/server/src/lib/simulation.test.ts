import { describe, expect, test } from "bun:test";
import { resolveSimulationFields } from "./simulation";

describe("resolveSimulationFields", () => {
	test("live sessions stay untagged", () => {
		expect(
			resolveSimulationFields({
				prolificPid: "real-participant",
			}),
		).toEqual({});
	});

	test("explicit simulated flag tags the session", () => {
		expect(
			resolveSimulationFields({
				simulated: true,
				simulationRunId: "run-1",
				personaId: "skeptic",
			}),
		).toEqual({
			simulated: true,
			simulationRunId: "run-1",
			personaId: "skeptic",
		});
	});

	test("sim- Prolific prefix is treated as simulated", () => {
		expect(
			resolveSimulationFields({
				prolificPid: "sim-run42-3",
			}),
		).toEqual({ simulated: true });
	});

	test("run and persona ids are ignored unless simulated", () => {
		expect(
			resolveSimulationFields({
				simulationRunId: "run-1",
				personaId: "skeptic",
				prolificPid: "abc",
			}),
		).toEqual({});
	});
});
