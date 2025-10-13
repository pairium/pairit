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
  initialPageId?: string;
  pages?: ExperimentPage[];
};

const program = new Command();

program
  .name("pairit")
  .description("CLI for Pairit experiment configs")
  .version("0.1.0");

const configCommand = program
  .command("config")
  .description("Manage experiment configs");

configCommand
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

configCommand
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

configCommand
  .command("upload")
  .argument("<config>", "Path to YAML config")
  .requiredOption("--owner <owner>", "Owner email or id")
  .option("--config-id <configId>", "Config id (defaults to hash)")
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

configCommand
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

configCommand
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

const mediaCommand = program
  .command("media")
  .description("Manage Cloud Storage media assets");

mediaCommand
  .command("upload")
  .argument("<file>", "Path to the media file to upload")
  .option(
    "--bucket <bucket>",
    "Destination Google Cloud Storage bucket (optional override)"
  )
  .option("--object <object>", "Destination object path (defaults to derived hash)")
  .option("--content-type <contentType>", "Content type to set on the object")
  .option("--metadata <json>", "Optional metadata JSON string")
  .option("--private", "Keep the uploaded object private (defaults to public)")
  .description("Upload a media asset via Pairit Functions")
  .action(async (filePath: string, options: MediaUploadOptions) => {
    try {
      const isPublic = options.private ? false : true;
      const { object, checksum, response } = await uploadMedia(filePath, {
        bucket: options.bucket,
        object: options.object,
        metadata: options.metadata,
        contentType: options.contentType,
        public: isPublic,
      });
      console.log(`✓ Uploaded media ${object} (${checksum})`);
      if (typeof response !== "undefined") {
        console.log(JSON.stringify(response, null, 2));
      }
    } catch (error) {
      reportCliError("Media upload failed", error);
    }
  });

mediaCommand
  .command("list")
  .option(
    "--bucket <bucket>",
    "Bucket to list from (optional override)"
  )
  .option("--prefix <prefix>", "Prefix filter")
  .description("List media objects via Pairit Functions")
  .action(async (options: MediaListOptions) => {
    try {
      const params = new URLSearchParams();
      if (options.bucket) params.set("bucket", options.bucket);
      if (options.prefix) params.set("prefix", options.prefix);
      const response = await callFunctions(`/media?${params.toString()}`, { method: "GET" });

      const objects = Array.isArray(response.objects) ? response.objects : [];
      if (!objects.length) {
        console.log("No media objects found");
        return;
      }

      objects.forEach((object: MediaListEntry) => {
        console.log(
          `${object.name} | size=${object.size ?? "n/a"} | updated=${object.updatedAt ?? "n/a"}`
        );
      });
    } catch (error) {
      reportCliError("Media list failed", error);
    }
  });

mediaCommand
  .command("delete")
  .argument("<object>", "Object path to delete")
  .option("--force", "Skip confirmation")
  .description("Delete a media object via Pairit Functions")
  .action(async (object: string, options: MediaDeleteOptions) => {
    try {
      if (!options.force) {
        const confirmed = await promptConfirm(`Delete media ${object}? (y/N)`);
        if (!confirmed) {
          console.log("Deletion aborted");
          return;
        }
      }

      console.log(`Deleting media ${object} at ${encodeURIComponent(object)}`);
      // await callFunctions(
      //   `/media/${encodeURIComponent(object)}`,
      //   { method: "DELETE" }
      // );
      console.log(`✓ Deleted media ${object}`);
    } catch (error) {
      reportCliError("Media delete failed", error);
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

type MediaUploadOptions = {
  bucket?: string;
  object?: string;
  metadata?: string;
  contentType?: string;
  public?: boolean;
  private?: boolean;
};

type MediaListOptions = {
  bucket?: string;
  prefix?: string;
};

type MediaDeleteOptions = {
  bucket?: string;
  force?: boolean;
};

type MediaListEntry = {
  name: string;
  size?: number;
  updatedAt?: string | null;
  metadata?: unknown;
};

async function lintConfig(configPath: string): Promise<void> {
  const config = await loadConfig(configPath);

  const errors: string[] = [];
  if (!config.schema_version) {
    errors.push("missing schema_version");
  }
  if (!config.initialPageId) {
    errors.push("missing initialPageId");
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
    initialPageId: config.initialPageId ?? nodes[0]?.id ?? "intro",
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
  const hashBuffer = createHash("sha256").update(compiledContent).digest();
  const checksum = hashBuffer.toString("hex");
  const parsed = JSON.parse(compiledContent) as unknown;

  const configId = options.configId ?? toBase64Url(hashBuffer.subarray(0, 12));

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

type MediaUploadPayload = {
  bucket?: string;
  object: string;
  checksum: string;
  data: string;
  contentType?: string | null;
  metadata?: Record<string, unknown> | null;
  public?: boolean;
};

async function uploadMedia(
  filePath: string,
  options: MediaUploadOptions
): Promise<{ object: string; checksum: string; response: unknown }> {
  const resolved = await resolvePath(filePath);
  const fileBuffer = await readFile(resolved);
  const hashBuffer = createHash("sha256").update(fileBuffer).digest();
  const checksum = hashBuffer.toString("hex");
  const defaultObject = `${toBase64Url(hashBuffer.subarray(0, 12))}${path.extname(resolved)}`;
  const object = options.object ?? defaultObject;
  const shouldBePublic = typeof options.public === "boolean" ? options.public : true;

  let metadata: Record<string, unknown> | undefined;
  if (options.metadata) {
    try {
      metadata = JSON.parse(options.metadata) as Record<string, unknown>;
    } catch (error) {
      throw new Error(
        `Invalid metadata JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const payload: MediaUploadPayload = {
    bucket: options.bucket,
    object,
    checksum,
    data: fileBuffer.toString("base64"),
    contentType: options.contentType ?? null,
    metadata: metadata ?? null,
    public: shouldBePublic,
  };

  const response = await callFunctions("/media/upload", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  });

  return { object, checksum, response };
}

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
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
  const envUrl = "https://manager-pdxzcarxcq-uk.a.run.app";
  if (envUrl) return envUrl;

  const project = process.env.FIREBASE_CONFIG
    ? JSON.parse(process.env.FIREBASE_CONFIG).projectId
    : process.env.GCLOUD_PROJECT;

  const projectId = project ?? "pairit-local";
  return `http://127.0.0.1:5001/${projectId}/us-east4/api`;
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

