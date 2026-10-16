#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { type ProviderCredentials, UnifiedActivityReportingServer } from "./unifiedServer.js";

dotenv.config();

const DEFAULT_HOSTED_URL = process.env.DEVREL_MCP_URL || "https://devrel.codingcat.dev";
const CLI_CONFIG_PATH = join(homedir(), ".config", "devrel-mcp", "cli.json");

interface CliConfig {
  baseUrl: string;
  cliToken: string;
  email?: string;
}

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

async function runCliLogin(args: string[]) {
  const baseUrl = (parseFlag(args, "--url") || DEFAULT_HOSTED_URL).replace(/\/$/, "");
  console.log(`\n🔐 Starting DevRel MCP CLI authentication with ${baseUrl}...`);

  const startRes = await fetch(`${baseUrl}/api/cli/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientName: "devrel-mcp-cli" }),
  });

  if (!startRes.ok) {
    throw new Error(`Failed to initiate CLI login (${startRes.status}): ${await startRes.text()}`);
  }

  const { deviceCode, userCode, verificationUri, expiresIn, interval } = (await startRes.json()) as {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    expiresIn: number;
    interval: number;
  };

  console.log("\n============================================================");
  console.log("  Open this URL in your browser to sign in & approve access:");
  console.log(`  👉 ${verificationUri}`);
  console.log(`  Verification Code: ${userCode}`);
  console.log("============================================================\n");
  console.log("Waiting for browser approval...");

  const deadline = Date.now() + expiresIn * 1000;
  const pollMs = Math.max((interval || 3) * 1000, 1500);

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    const pollRes = await fetch(`${baseUrl}/api/cli/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceCode }),
    });

    if (pollRes.status === 202) continue;
    if (!pollRes.ok) {
      throw new Error(`CLI authentication failed: ${await pollRes.text()}`);
    }

    const { cliToken, email } = (await pollRes.json()) as { cliToken: string; email?: string };
    await mkdir(dirname(CLI_CONFIG_PATH), { recursive: true });
    const cfg: CliConfig = { baseUrl, cliToken, email };
    await writeFile(CLI_CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });

    console.log(`✅ Authenticated as ${email || "user"}! Saved CLI credentials to ${CLI_CONFIG_PATH}`);
    console.log(`🌐 Hosted MCP Endpoint: ${baseUrl}/mcp`);
    return;
  }

  throw new Error("CLI authentication timed out.");
}

async function runCliPushCredentials(args: string[]) {
  if (!existsSync(CLI_CONFIG_PATH)) {
    throw new Error(`Not logged in. Run 'devrel-mcp login' first.`);
  }
  const cfg = JSON.parse(await readFile(CLI_CONFIG_PATH, "utf-8")) as CliConfig;
  const baseUrl = (parseFlag(args, "--url") || cfg.baseUrl).replace(/\/$/, "");
  const credentials = buildEnvCredentials();

  const res = await fetch(`${baseUrl}/api/connections`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.cliToken}`,
      Origin: baseUrl,
    },
    body: JSON.stringify(credentials),
  });

  if (!res.ok) {
    throw new Error(`Failed to push credentials (${res.status}): ${await res.text()}`);
  }
  console.log(`✅ Encrypted and synced local provider credentials to ${baseUrl}!`);
}

function buildEnvCredentials(): ProviderCredentials {
  const gdeToken = process.env.ADVOCU_ACCESS_TOKEN;
  const mvpToken = process.env.MVP_ACCESS_TOKEN;
  const profileId = Number.parseInt(process.env.MVP_USER_PROFILE_ID || "", 10);
  const youtubeApiKey = process.env.YOUTUBE_API_KEY;
  const devtoApiKey = process.env.DEVTO_API_KEY;
  const hashnodeToken = process.env.HASHNODE_ACCESS_TOKEN;
  const hashnodeHost = process.env.HASHNODE_PUBLICATION_HOST;
  const githubToken = process.env.GITHUB_ACCESS_TOKEN;

  const credentials: ProviderCredentials = {};
  if (gdeToken) {
    credentials.gde = { accessToken: gdeToken, baseUrl: process.env.ADVOCU_API_URL };
  }
  if (mvpToken && profileId) {
    credentials.mvp = { accessToken: mvpToken, userProfileId: profileId, baseUrl: process.env.MVP_API_URL };
  }
  if (youtubeApiKey) {
    credentials.youtube = { apiKey: youtubeApiKey };
  }
  if (devtoApiKey) {
    credentials.devto = { apiKey: devtoApiKey };
  }
  if (hashnodeToken && hashnodeHost) {
    credentials.hashnode = { accessToken: hashnodeToken, publicationHost: hashnodeHost };
  }
  if (githubToken) {
    credentials.github = { accessToken: githubToken };
  }
  return credentials;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "login") {
    await runCliLogin(args.slice(1));
    return;
  }
  if (args[0] === "push-credentials" || args[0] === "sync") {
    await runCliPushCredentials(args.slice(1));
    return;
  }

  try {
    const credentials = buildEnvCredentials();
    const hasAnyCredential = Object.keys(credentials).length > 0;
    if (!hasAnyCredential) {
      throw new Error("Neither GDE nor MVP (nor analytics) credentials configured. At least one must be set.");
    }

    const packageDocsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "docs");
    const docsDir =
      process.env.DOCS_DIR || (existsSync(join(process.cwd(), "docs")) ? join(process.cwd(), "docs") : packageDocsDir);

    const server = new UnifiedActivityReportingServer({
      credentials,
      readDocumentation: (file) => readFile(join(docsDir, file), "utf-8"),
    });
    await server.connect(new StdioServerTransport());
    console.error("🚀 Unified DevRel Activity Reporting MCP Server running");
  } catch (error) {
    console.error("Failed to start Activity Reporting MCP Server:", error);
    process.exit(1);
  }
}

main();
