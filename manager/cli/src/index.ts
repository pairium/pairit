#!/usr/bin/env node

import { Command } from "commander";
import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

type ExperimentPage = {
  id: string;
  components?: unknown[];
};

type ExperimentConfig = {
  schema_version?: string;
  initialNodeId?: string;
  pages?: ExperimentPage[];
};

const program = new Command();

program
  .name("pairit")
  .description("CLI for Pairit experiment configs")
  .version("0.1.0");

program
  .command("lint")
  .argument("<config>", "Path to YAML config")
  .description("Run minimal validation on a config file")
  .action(async (configPath: string) => {
    try {
      await lintConfig(configPath);
      console.log(`✓ ${configPath} passed lint checks`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Lint failed: ${error.message}`);
      } else {
        console.error("Lint failed with unknown error");
      }
      process.exitCode = 1;
    }
  });

program
  .command("compile")
  .argument("<config>", "Path to YAML config")
  .description("Compile YAML config to canonical JSON next to source")
  .action(async (configPath: string) => {
    try {
      const outPath = await compileConfig(configPath);
      console.log(`✓ Wrote compiled JSON to ${outPath}`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Compile failed: ${error.message}`);
      } else {
        console.error("Compile failed with unknown error");
      }
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});

async function lintConfig(configPath: string): Promise<void> {
  const config = await loadConfig(configPath);

  const errors: string[] = [];
  if (!config.schema_version) {
    errors.push("missing schema_version");
  }
  if (!config.initialNodeId) {
    errors.push("missing initialNodeId");
  }
  if (!Array.isArray(config.pages) || config.pages.length === 0) {
    errors.push("pages must be a non-empty array");
  }
  if (Array.isArray(config.pages)) {
    config.pages.forEach((page, index) => {
      if (!page.id) {
        errors.push(`pages[${index}] is missing id`);
      }
    });
  }

  if (errors.length) {
    throw new Error(errors.join(", "));
  }
}

async function compileConfig(configPath: string): Promise<string> {
  const config = await loadConfig(configPath);

  const nodes = (config.pages ?? []).map((page) => {
    const { id, ...rest } = page;
    return {
      id,
      ...rest,
    };
  });

  const output = {
    schema_version: config.schema_version ?? "v2",
    initialNodeId: config.initialNodeId ?? nodes[0]?.id ?? "intro",
    nodes,
  };

  const resolvedPath = await resolvePath(configPath);
  const outPath = path.join(
    path.dirname(resolvedPath),
    `${path.basename(resolvedPath, path.extname(resolvedPath))}.json`
  );
  await writeFile(outPath, JSON.stringify(output, null, 2), "utf8");
  return outPath;
}

async function loadConfig(configPath: string): Promise<ExperimentConfig> {
  const resolvedPath = await resolvePath(configPath);
  const content = await readFile(resolvedPath, "utf8");
  const parsed = YAML.parse(content);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("config must be an object");
  }
  return parsed as ExperimentConfig;
}

async function resolvePath(configPath: string): Promise<string> {
  const cwd = process.cwd();
  const absolute = path.isAbsolute(configPath)
    ? configPath
    : path.resolve(cwd, configPath);

  await stat(absolute);
  return absolute;
}

export const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);

