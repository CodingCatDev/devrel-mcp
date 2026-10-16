async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function buildDiscoveryLinkHeader(_origin: string): string {
  return [
    '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
    '</.well-known/mcp/server-card.json>; rel="service-desc"; type="application/json"',
    '</openapi.json>; rel="service-desc"; type="application/openapi+json"',
    '</docs>; rel="service-doc"; type="text/html"',
    '</llms.txt>; rel="describedby"; type="text/plain"',
    '</auth.md>; rel="service-meta"; type="text/markdown"',
    '</.well-known/ai-catalog.json>; rel="ai-catalog"; type="application/json"',
  ].join(", ");
}

export function wantsMarkdown(request: Request): boolean {
  const accept = (request.headers.get("accept") || "").toLowerCase();
  if (!accept.includes("text/markdown")) return false;
  if (!accept.includes("text/html")) return true;
  return accept.indexOf("text/markdown") < accept.indexOf("text/html");
}

export function markdownResponse(markdown: string, status = 200): Response {
  const tokens = Math.max(1, Math.ceil(markdown.length / 4));
  return new Response(markdown, {
    status,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
      "x-markdown-tokens": String(tokens),
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function renderMarkdownForPath(pathname: string, origin: string): Response | null {
  const clean = pathname.replace(/\/$/, "") || "/";
  if (clean === "/") {
    const md = `# DevRel Activity Reporting & Analytics MCP Server (${origin})

> Hosted Model Context Protocol (MCP) server for Developer Relations (DevRel) activity reporting and content analytics across Google GDE (Advocu), Microsoft MVP, AWS Community Builders, Docker Captains, Cypress Ambassadors, YouTube, Dev.to, Hashnode, and GitHub.

## Endpoints & Discovery

- **Streamable HTTP MCP Endpoint**: \`${origin}/mcp\`
- **OAuth Protected Resource Metadata**: \`${origin}/.well-known/oauth-protected-resource\`
- **OAuth Authorization Server Metadata**: \`${origin}/.well-known/oauth-authorization-server\`
- **Agent Registration Guide (auth.md)**: \`${origin}/auth.md\`
- **MCP Server Card (SEP-1649)**: \`${origin}/.well-known/mcp/server-card.json\`
- **API Catalog (RFC 9727)**: \`${origin}/.well-known/api-catalog\`
- **ARD Capability Manifest**: \`${origin}/.well-known/ai-catalog.json\`
- **Agent Skills Index**: \`${origin}/.well-known/agent-skills/index.json\`
- **Full Tool Reference**: \`${origin}/llms-full.txt\`

## Quick Connect (Claude Code / Cursor / VS Code / Windsurf)

\`\`\`json
{
  "mcpServers": {
    "devrel-mcp": {
      "type": "http",
      "url": "${origin}/mcp"
    }
  }
}
\`\`\`

## CLI Terminal Login

\`\`\`bash
npx @codingcatdev/devrel-mcp login --url ${origin}
npx @codingcatdev/devrel-mcp push-credentials --url ${origin}
\`\`\`

## Available MCP Tools (19 Total)

### Google GDE (Advocu) — 7 Tools
- \`submit_gde_content_creation\`, \`submit_gde_public_speaking\`, \`submit_gde_workshop\`, \`submit_gde_mentoring\`, \`submit_gde_product_feedback\`, \`submit_gde_interaction_with_googlers\`, \`submit_gde_stories\`

### Microsoft MVP — 4 Tools
- \`submit_mvp_video_activity\`, \`submit_mvp_blog_activity\`, \`submit_mvp_speaking_activity\`, \`submit_mvp_book_activity\`

### Content Analytics Auto-Fetch — 4 Tools
- \`fetch_youtube_video_metrics\`, \`fetch_devto_article_metrics\`, \`fetch_hashnode_post_metrics\`, \`fetch_github_repo_metrics\`

### Ambassador Programs & Unified D1 Ledger — 2 Tools
- \`log_devrel_activity\`, \`list_logged_devrel_activities\`

### Documentation & Discovery — 2 Tools
- \`get_docs\`, \`discover_program_options\`
`;
    return markdownResponse(md);
  }

  if (clean === "/docs") {
    const md = `# DevRel MCP Documentation & Tool Reference (${origin}/docs)

See \`${origin}/llms-full.txt\` for complete input schemas and examples for all 19 MCP tools, or connect directly to \`${origin}/mcp\`.
`;
    return markdownResponse(md);
  }

  if (clean === "/cli-auth" || clean === "/consent") {
    const md = `# DevRel MCP Authorization (${origin}${clean})

Use \`${origin}/auth.md\` or \`POST ${origin}/api/cli/start\` for programmatic agent and CLI terminal registration.
`;
    return markdownResponse(md);
  }

  return null;
}

export function buildRobotsTxt(origin: string): Response {
  const body = `User-agent: *
Content-Signal: ai-train=yes, search=yes, ai-input=yes
Allow: /

User-agent: GPTBot
Content-Signal: ai-train=yes, search=yes, ai-input=yes
Allow: /

User-agent: OAI-SearchBot
Content-Signal: ai-train=yes, search=yes, ai-input=yes
Allow: /

User-agent: ChatGPT-User
Content-Signal: ai-train=yes, search=yes, ai-input=yes
Allow: /

User-agent: ClaudeBot
Content-Signal: ai-train=yes, search=yes, ai-input=yes
Allow: /

User-agent: Claude-SearchBot
Content-Signal: ai-train=yes, search=yes, ai-input=yes
Allow: /

User-agent: PerplexityBot
Content-Signal: ai-train=yes, search=yes, ai-input=yes
Allow: /

User-agent: Google-Extended
Content-Signal: ai-train=yes, search=yes, ai-input=yes
Allow: /

Sitemap: ${origin}/sitemap.xml
Agentmap: ${origin}/.well-known/ai-catalog.json
`;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function buildApiCatalog(origin: string): Response {
  const catalog = {
    linkset: [
      {
        anchor: `${origin}/mcp`,
        "service-desc": [
          {
            href: `${origin}/.well-known/mcp/server-card.json`,
            type: "application/json",
          },
          {
            href: `${origin}/openapi.json`,
            type: "application/openapi+json",
          },
        ],
        "service-doc": [
          {
            href: `${origin}/docs`,
            type: "text/html",
          },
          {
            href: `${origin}/llms-full.txt`,
            type: "text/plain",
          },
        ],
        status: [
          {
            href: `${origin}/api/health`,
            type: "application/json",
          },
        ],
      },
      {
        anchor: `${origin}/api/connections`,
        "service-desc": [
          {
            href: `${origin}/openapi.json`,
            type: "application/openapi+json",
          },
        ],
        "service-doc": [
          {
            href: `${origin}/docs`,
            type: "text/html",
          },
        ],
        status: [
          {
            href: `${origin}/api/health`,
            type: "application/json",
          },
        ],
      },
    ],
  };

  return new Response(JSON.stringify(catalog, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/linkset+json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function buildOpenApiSpec(origin: string): Response {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "DevRel Activity Reporting & Analytics MCP API",
      version: "1.0.0",
      description:
        "REST and Streamable HTTP Model Context Protocol (MCP) endpoints for DevRel activity reporting and content analytics on Cloudflare Workers + D1.",
    },
    servers: [{ url: origin }],
    paths: {
      "/mcp": {
        post: {
          operationId: "handleMcpStreamableHttp",
          summary: "Streamable HTTP MCP JSON-RPC 2.0 endpoint",
          security: [{ oauth2: ["mcp"] }],
          responses: {
            "200": { description: "JSON-RPC 2.0 MCP response" },
            "401": { description: "OAuth 2.1 Bearer token required" },
          },
        },
      },
      "/api/connections": {
        get: {
          operationId: "getConnectionStatus",
          summary: "Return boolean connection status for each configured DevRel provider",
          responses: { "200": { description: "Provider connection status map" } },
        },
        put: {
          operationId: "replaceConnections",
          summary: "Encrypt and store provider credentials in Cloudflare D1",
          responses: { "200": { description: "Credentials saved" } },
        },
        patch: {
          operationId: "mergeConnections",
          summary: "Merge and encrypt additional provider credentials in Cloudflare D1",
          responses: { "200": { description: "Credentials merged" } },
        },
      },
      "/api/cli/start": {
        post: {
          operationId: "startCliDeviceSession",
          summary: "Start a CLI or agent device verification session",
          responses: { "200": { description: "Device code, user code, and verification URI" } },
        },
      },
      "/api/health": {
        get: {
          operationId: "getHealth",
          summary: "Service health status",
          responses: { "200": { description: "Service is healthy" } },
        },
      },
    },
  };

  return new Response(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function buildRootProtectedResourceMetadata(origin: string): Response {
  const prm = {
    resource: origin,
    resource_name: "DevRel MCP by CodingCat.dev",
    authorization_servers: [`${origin}/api/auth`],
    bearer_methods_supported: ["header"],
    dpop_signing_alg_values_supported: ["EdDSA", "ES256", "ES512", "PS256", "RS256"],
    scopes_supported: ["mcp", "openid", "profile", "email", "offline_access"],
  };
  return new Response(JSON.stringify(prm, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function enrichAuthServerMetadata(
  baseMetadata: Record<string, unknown>,
  origin: string,
): Record<string, unknown> {
  return {
    ...baseMetadata,
    issuer: `${origin}/api/auth`,
    revocation_endpoint: `${origin}/api/auth/oauth2/revoke`,
    agent_auth: {
      skill: `${origin}/auth.md`,
      register_uri: `${origin}/agent/identity`,
      identity_endpoint: `${origin}/agent/identity`,
      claim_uri: `${origin}/cli-auth`,
      claim_endpoint: `${origin}/cli-auth`,
      revocation_uri: `${origin}/api/auth/oauth2/revoke`,
      events_endpoint: `${origin}/api/auth/agent/events`,
      identity_types_supported: ["identity_assertion", "anonymous"],
      credential_types_supported: ["bearer_token", "oauth_access_token"],
      identity_assertion: {
        assertion_types_supported: [
          "urn:ietf:params:oauth:token-type:id-jag",
          "verified_email",
        ],
        credential_types_supported: ["bearer_token", "oauth_access_token"],
        claim_uri: `${origin}/cli-auth`,
      },
      anonymous: {
        credential_types_supported: ["bearer_token", "oauth_access_token"],
        claim_uri: `${origin}/cli-auth`,
      },
      events_supported: [
        "https://schemas.workos.com/events/agent/auth/identity/assertion/revoked",
      ],
    },
  };
}

export function buildAuthMd(origin: string): Response {
  const content = `# DevRel MCP auth.md

You are an AI agent connecting to **DevRel MCP by CodingCat.dev** (\`${origin}\`).
This service supports **OAuth 2.1 Dynamic Client Registration (RFC 7591)**, **Protected Resource Metadata (RFC 9728)**, and **CLI / Agent Device Claim Registration** per the \`auth.md\` specification.

## 1. Discovery Endpoints

- **OAuth Protected Resource Metadata (Root)**: \`${origin}/.well-known/oauth-protected-resource\`
- **OAuth Protected Resource Metadata (MCP)**: \`${origin}/.well-known/oauth-protected-resource/mcp\`
- **OAuth Authorization Server Metadata**: \`${origin}/.well-known/oauth-authorization-server\`
- **Agent Registration Endpoint**: \`POST ${origin}/agent/identity\` (or \`POST ${origin}/api/cli/start\`)
- **Human Claim Verification URL**: \`${origin}/cli-auth\`
- **Token Endpoint**: \`POST ${origin}/api/auth/oauth2/token\`
- **Revocation Endpoint**: \`POST ${origin}/api/auth/oauth2/revoke\`

## 2. Supported Registration & Authentication Flows

### Flow A: OAuth 2.1 Dynamic Client Registration + PKCE (Recommended for MCP Clients)

1. Register your agent client via \`POST ${origin}/api/auth/oauth2/register\`.
2. Direct the user to \`${origin}/api/auth/oauth2/authorize\` with \`code_challenge_method=S256\` and \`scope=mcp\`.
3. Exchange the authorization code at \`POST ${origin}/api/auth/oauth2/token\` for a Bearer access token.
4. Call \`POST ${origin}/mcp\` with \`Authorization: Bearer <access_token>\`.

### Flow B: Agent / CLI Device Claim Ceremony (\`anonymous\` or \`verified_email\`)

1. Call \`POST ${origin}/agent/identity\` (or \`POST ${origin}/api/cli/start\`) with \`{"type": "anonymous", "clientName": "your-agent"}\`.
2. Receive \`deviceCode\`, \`userCode\` (e.g. \`ABCD-1234\`), and \`verificationUri\` (\`${origin}/cli-auth?code=ABCD-1234\`).
3. Present \`verificationUri\` and \`userCode\` to the user so they can sign in and claim the session.
4. Poll \`POST ${origin}/api/cli/poll\` with \`{"deviceCode": "<deviceCode>"}\` until \`status === "approved"\` and use the returned \`cliToken\` in \`Authorization: Bearer <cliToken>\`.
`;
  return markdownResponse(content);
}

export function buildMcpServerCard(origin: string): Response {
  const card = {
    serverInfo: {
      name: "DevRel Activity Reporting & Analytics MCP Server",
      version: "1.0.0",
    },
    description:
      "Hosted Model Context Protocol (MCP) server for Developer Relations (DevRel) activity reporting and content analytics across Google GDE (Advocu), Microsoft MVP, YouTube, Dev.to, Hashnode, GitHub, AWS Community Builders, Docker Captains, and Cypress Ambassadors.",
    url: `${origin}/mcp`,
    endpoint: `${origin}/mcp`,
    transport: {
      type: "streamable-http",
      endpoint: `${origin}/mcp`,
    },
    capabilities: {
      tools: true,
      resources: false,
      prompts: false,
    },
    authentication: {
      type: "oauth2",
      resourceMetadata: `${origin}/.well-known/oauth-protected-resource/mcp`,
      authorizationServerMetadata: `${origin}/.well-known/oauth-authorization-server`,
    },
  };

  return new Response(JSON.stringify(card, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function buildA2AAgentCard(origin: string): Response {
  const card = {
    name: "DevRel Activity Reporting & Analytics Agent",
    version: "1.0.0",
    description:
      "AI agent and MCP service that fetches developer content metrics (YouTube, Dev.to, Hashnode, GitHub) and submits DevRel activity reports to Google GDE (Advocu), Microsoft MVP, AWS Community Builders, Docker Captains, and Cypress Ambassadors.",
    url: `${origin}/mcp`,
    provider: {
      organization: "CodingCat.dev",
      url: "https://codingcat.dev",
    },
    supportedInterfaces: [
      {
        url: `${origin}/mcp`,
        protocolBinding: "HTTP+JSON",
        transport: "streamable-http",
      },
    ],
    capabilities: {
      streaming: true,
      pushNotifications: false,
    },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: [
      {
        id: "devrel-activity-reporting",
        name: "DevRel Activity Reporting",
        description:
          "Submit developer advocacy activity drafts and reports to Google GDE (Advocu), Microsoft MVP, AWS Community Builders, Docker Captains, and Cypress Ambassadors.",
        tags: ["devrel", "gde", "mvp", "advocu", "aws-community-builders"],
        examples: [
          "Submit my YouTube video to Google GDE Advocu and Microsoft MVP",
          "Log my conference talk to AWS Community Builders",
        ],
      },
      {
        id: "devrel-content-analytics",
        name: "Content Analytics Auto-Fetching",
        description:
          "Fetch live view counts, likes, reactions, stars, and publish dates from YouTube Data API v3, Dev.to, Hashnode, and GitHub.",
        tags: ["analytics", "youtube", "devto", "hashnode", "github"],
        examples: [
          "Fetch views and likes for my latest YouTube video",
          "Get page views and reactions for my Dev.to article",
        ],
      },
    ],
  };

  return new Response(JSON.stringify(card, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function getAgentSkillMarkdown(skillName: string, origin: string): string | null {
  if (skillName === "devrel-mcp") {
    return `---
name: devrel-mcp
description: Connect to and invoke the DevRel Activity Reporting & Analytics MCP Server (${origin}/mcp) to fetch content metrics from YouTube, Dev.to, Hashnode, and GitHub and submit activity reports to Google GDE (Advocu), Microsoft MVP, AWS Community Builders, Docker Captains, and Cypress Ambassadors.
---

# DevRel MCP Skill

Use this skill when a user wants to fetch developer content analytics or report DevRel activities to Google GDE (Advocu), Microsoft MVP, AWS Community Builders, Docker Captains, or Cypress Ambassadors.

## MCP Server Connection

- **Endpoint**: \`${origin}/mcp\` (Streamable HTTP)
- **OAuth Protected Resource Metadata**: \`${origin}/.well-known/oauth-protected-resource/mcp\`
- **OAuth Authorization Server**: \`${origin}/.well-known/oauth-authorization-server\`

## Recommended Workflow

1. Call \`discover_program_options\` to inspect valid activity categories, country names, and tag lists for GDE or MVP.
2. Call \`fetch_youtube_video_metrics\`, \`fetch_devto_article_metrics\`, \`fetch_hashnode_post_metrics\`, or \`fetch_github_repo_metrics\` to retrieve accurate view counts, URLs, and publication dates.
3. Submit the activity using \`submit_gde_*\`, \`submit_mvp_*\`, or \`log_devrel_activity\`.
`;
  }

  if (skillName === "devrel-cli-auth") {
    return `---
name: devrel-cli-auth
description: Authenticate a CLI terminal or headless AI agent with ${origin} using device code verification and sync encrypted DevRel provider credentials to Cloudflare D1.
---

# DevRel CLI & Headless Agent Authentication Skill

## Interactive Terminal Login

\`\`\`bash
npx @codingcatdev/devrel-mcp login --url ${origin}
\`\`\`

## Programmatic Device Code Flow

1. \`POST ${origin}/api/cli/start\` with \`{"clientName": "my-agent"}\`
2. Ask the user to open the returned \`verificationUri\` (\`${origin}/cli-auth?code=...\`) and approve the code.
3. Poll \`POST ${origin}/api/cli/poll\` with \`{"deviceCode": "..."}\` until \`status === "approved"\`.
4. Use the returned \`cliToken\` as \`Authorization: Bearer <cliToken>\` against \`${origin}/api/connections\` or \`${origin}/api/activities\`.
`;
  }

  return null;
}

export async function buildAgentSkillsIndex(origin: string): Promise<Response> {
  const skillDefs = [
    {
      name: "devrel-mcp",
      description:
        "Connect to the DevRel Activity Reporting & Analytics MCP Server to fetch content metrics (YouTube, Dev.to, Hashnode, GitHub) and submit reports to Google GDE (Advocu), Microsoft MVP, and Ambassador programs.",
    },
    {
      name: "devrel-cli-auth",
      description:
        "Authenticate a CLI terminal or headless agent with DevRel MCP via browser verification URL and sync encrypted provider credentials to Cloudflare D1.",
    },
  ];

  const skills = await Promise.all(
    skillDefs.map(async (def) => {
      const content = getAgentSkillMarkdown(def.name, origin) || "";
      const hash = await sha256Hex(content);
      return {
        name: def.name,
        type: "skill-md",
        description: def.description,
        url: `/.well-known/agent-skills/${def.name}/SKILL.md`,
        digest: `sha256:${hash}`,
      };
    }),
  );

  const index = {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills,
  };

  return new Response(JSON.stringify(index, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function buildAiCatalog(origin: string, hostname: string): Response {
  const catalog = {
    specVersion: "1.0",
    host: {
      displayName: "DevRel MCP by CodingCat.dev",
      identifier: `did:web:${hostname}`,
    },
    entries: [
      {
        identifier: `urn:air:${hostname}:server:devrel-mcp`,
        displayName: "DevRel Activity Reporting & Analytics MCP Server",
        type: "application/mcp-server-card+json",
        url: `${origin}/.well-known/mcp/server-card.json`,
        representativeQueries: [
          "submit my Google GDE activity draft to Advocu",
          "log a Microsoft MVP speaking engagement or blog post",
          "fetch YouTube video views and Dev.to article analytics for my DevRel report",
          "log an AWS Community Builders or Docker Captains activity",
        ],
      },
      {
        identifier: `urn:air:${hostname}:api:devrel-openapi`,
        displayName: "DevRel MCP & Connections Vault OpenAPI Specification",
        type: "application/openapi+json",
        url: `${origin}/openapi.json`,
        representativeQueries: [
          "connect Advocu and Microsoft MVP tokens to the D1 vault",
          "start a CLI terminal device authentication session",
          "list logged DevRel activities across programs",
        ],
      },
      {
        identifier: `urn:air:${hostname}:skill:devrel-mcp`,
        displayName: "DevRel Activity Reporting & Analytics Agent Skill",
        type: "text/markdown",
        url: `${origin}/.well-known/agent-skills/devrel-mcp/SKILL.md`,
        representativeQueries: [
          "how to authenticate and call DevRel MCP tools",
          "auto-fetch content metrics before submitting GDE or MVP reports",
          "configure Claude Code or Cursor with devrel.codingcat.dev/mcp",
        ],
      },
    ],
  };

  return new Response(JSON.stringify(catalog, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function buildPoppyManifest(hostname: string): Response {
  const cleanDomain = hostname.replace(/^www\./, "");
  const manifest = {
    protocol_version: "0.1",
    organization: {
      name: "CodingCat.dev",
      domain: cleanDomain,
    },
    web: {},
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
