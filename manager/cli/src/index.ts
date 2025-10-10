#!/usr/bin/env node

import { Command } from "commander";
import { createHash } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import fetch, { RequestInit } from "node-fetch";
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

program
  .command("upload")
  .argument("<config>", "Path to YAML config")
  .requiredOption("--owner <owner>", "Owner email or id")
  .option("--config-id <configId>", "Config id (defaults to filename)")
  .option("--metadata <json>", "Optional metadata JSON string")
  .description("Compile and upload config via Pairit Functions")
  .action(async (configPath: string, options: UploadOptions) => {
    try {
      const { payload, checksum } = await buildUploadPayload(configPath, options);
      const response = await callFunctions("/configs/upload", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });

      console.log(`✓ Uploaded ${payload.configId} (${checksum})`);
      console.log(JSON.stringify(response, null, 2));
    } catch (error) {
      reportCliError("Upload failed", error);
    }
  });

program
  .command("list")
  .option("--owner <owner>", "Filter by owner")
  .description("List configs from Pairit Functions")
  .action(async (options: ListOptions) => {
    try {
      const params = options.owner ? `?owner=${encodeURIComponent(options.owner)}` : "";
      const response = await callFunctions(`/configs${params}`, { method: "GET" });

      const configs = Array.isArray(response.configs) ? response.configs : [];
      if (!configs.length) {
        console.log("No configs found");
        return;
      }

      configs.forEach((config: ConfigListEntry) => {
        console.log(
          `${config.configId} | owner=${config.owner} | checksum=${config.checksum} | updated=${config.updatedAt ?? "n/a"}`
        );
      });
    } catch (error) {
      reportCliError("List failed", error);
    }
  });

program
  .command("delete")
  .argument("<configId>", "Config id to delete")
  .option("--force", "Skip confirmation")
  .description("Delete config via Pairit Functions")
  .action(async (configId: string, options: DeleteOptions) => {
    try {
      if (!options.force) {
        const confirmed = await promptConfirm(`Delete config ${configId}? (y/N)`);
        if (!confirmed) {
          console.log("Deletion aborted");
          return;
        }
      }

      await callFunctions(`/configs/${encodeURIComponent(configId)}`, { method: "DELETE" });
      console.log(`✓ Deleted ${configId}`);
    } catch (error) {
      reportCliError("Delete failed", error);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});

type UploadOptions = {
  owner: string;
  configId?: string;
  metadata?: string;
};

type ListOptions = {
  owner?: string;
};

type DeleteOptions = {
  force?: boolean;
};

type ConfigListEntry = {
  configId: string;
  owner: string;
  checksum: string;
  updatedAt?: string | null;
  metadata?: unknown;
};

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

type UploadPayload = {
  configId: string;
  owner: string;
  checksum: string;
  metadata?: Record<string, unknown> | null;
  config: unknown;
};

async function buildUploadPayload(
  configPath: string,
  options: UploadOptions
): Promise<{ payload: UploadPayload; checksum: string }> {
  const compiledPath = await compileConfig(configPath);
  const compiledContent = await readFile(compiledPath, "utf8");
  const checksum = createHash("sha256").update(compiledContent).digest("hex");
  const parsed = JSON.parse(compiledContent) as unknown;

  const configId = options.configId ?? checksum;

  const metadata = options.metadata
    ? (JSON.parse(options.metadata) as Record<string, unknown>)
    : undefined;

  return {
    payload: {
      configId,
      owner: options.owner,
      checksum,
      metadata: metadata ?? null,
      config: parsed,
    },
    checksum,
  };
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

async function callFunctions(pathname: string, init: RequestInit): Promise<any> {
  const baseUrl = getFunctionsBaseUrl();
  const url = new URL(pathname, baseUrl).toString();
  const response = await fetch(url, init);

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON response: ${text}`);
  }
}

function getFunctionsBaseUrl(): string {
  // const envUrl = process.env.PAIRIT_FUNCTIONS_BASE_URL;
  const envUrl = "https://api-pdxzcarxcq-uk.a.run.app";
  if (envUrl) return envUrl;

  const project = process.env.FIREBASE_CONFIG
    ? JSON.parse(process.env.FIREBASE_CONFIG).projectId
    : process.env.GCLOUD_PROJECT;

  const projectId = project ?? "pairit-local";
  return `http://127.0.0.1:5001/${projectId}/us-central1/api`;
}

async function promptConfirm(prompt: string): Promise<boolean> {
  process.stdout.write(`${prompt} `);
  return new Promise((resolve) => {
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    process.stdin.once("data", (data) => {
      const input = data.toString().trim().toLowerCase();
      resolve(input === "y" || input === "yes");
      process.stdin.pause();
    });
  });
}

function reportCliError(prefix: string, error: unknown) {
  if (error instanceof Error) {
    console.error(`${prefix}: ${error.message}`);
  } else {
    console.error(`${prefix}: unknown error`);
  }
  process.exitCode = 1;
}

export const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);

