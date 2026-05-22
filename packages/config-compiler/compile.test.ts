import { describe, expect, it } from "bun:test";
import {
	buildCompiled,
	ConfigParseError,
	ConfigValidationError,
	compileYaml,
	parseYaml,
} from "./index";

const validYaml = `schema_version: "0.1.0"
initialPageId: intro
pages:
  - id: intro
    components:
      - type: text
        props: { content: hi }
  - id: done
    components:
      - type: button
        props: { label: ok }
`;

describe("parseYaml", () => {
	it("parses valid YAML", () => {
		const parsed = parseYaml(validYaml);
		expect(parsed.schema_version).toBe("0.1.0");
		expect(parsed.pages?.length).toBe(2);
	});

	it("rejects null / scalar YAML", () => {
		expect(() => parseYaml("")).toThrow(ConfigParseError);
		expect(() => parseYaml("just a string")).toThrow(ConfigParseError);
	});

	it("rejects malformed YAML", () => {
		expect(() => parseYaml("key: [")).toThrow(ConfigParseError);
	});
});

describe("buildCompiled", () => {
	it("auto-generates component IDs based on type+index", () => {
		const parsed = parseYaml(validYaml);
		const compiled = buildCompiled(parsed) as {
			pages: Record<string, { components: { id: string; type: string }[] }>;
		};
		expect(compiled.pages.intro.components[0].id).toBe("text-0");
		expect(compiled.pages.done.components[0].id).toBe("button-0");
	});

	it("preserves explicit component IDs", () => {
		const yaml = `schema_version: "0.1.0"
initialPageId: intro
pages:
  - id: intro
    components:
      - type: text
        id: greeting
        props: { content: hi }
`;
		const compiled = buildCompiled(parseYaml(yaml)) as {
			pages: Record<string, { components: { id: string }[] }>;
		};
		expect(compiled.pages.intro.components[0].id).toBe("greeting");
	});

	it("flattens matchmaking pool config into the matchmaking component", () => {
		const yaml = `schema_version: "0.1.0"
initialPageId: wait
matchmaking:
  - id: pool-a
    num_users: 2
    timeoutSeconds: 60
    timeoutTarget: lonely
    assignment:
      type: random
      conditions: [control, treatment]
pages:
  - id: wait
    components:
      - type: matchmaking
        props: { poolId: pool-a }
`;
		const compiled = buildCompiled(parseYaml(yaml)) as {
			pages: Record<
				string,
				{ components: { props: Record<string, unknown> }[] }
			>;
		};
		const props = compiled.pages.wait.components[0].props;
		expect(props.num_users).toBe(2);
		expect(props.timeoutSeconds).toBe(60);
		expect(props.timeoutTarget).toBe("lonely");
		expect(props.assignmentType).toBe("random");
		expect(props.conditions).toEqual(["control", "treatment"]);
	});

	it("falls back initialPageId to first page when missing", () => {
		const yaml = `schema_version: "0.1.0"
pages:
  - id: alpha
    components: []
  - id: beta
    components: []
`;
		const compiled = buildCompiled(parseYaml(yaml)) as {
			initialPageId: string;
		};
		expect(compiled.initialPageId).toBe("alpha");
	});
});

describe("compileYaml", () => {
	it("produces stable checksum + defaultConfigId from canonical JSON", () => {
		const a = compileYaml(validYaml);
		const b = compileYaml(validYaml);
		expect(a.checksum).toBe(b.checksum);
		expect(a.defaultConfigId).toBe(b.defaultConfigId);
	});

	it("strips top-level flags from the compiled config", () => {
		const yaml = `${validYaml}allowRetake: true\nrequireAuth: false\n`;
		const compiled = compileYaml(yaml);
		expect(compiled.allowRetake).toBe(true);
		expect(compiled.requireAuth).toBe(false);
		expect("allowRetake" in compiled.config).toBe(false);
		expect("requireAuth" in compiled.config).toBe(false);
	});

	it("throws ConfigValidationError on missing schema_version", () => {
		const yaml = `initialPageId: a
pages:
  - id: a
    components: []
`;
		expect(() => compileYaml(yaml)).toThrow(ConfigValidationError);
	});

	it("throws ConfigParseError on malformed YAML", () => {
		expect(() => compileYaml("key: [")).toThrow(ConfigParseError);
	});
});
