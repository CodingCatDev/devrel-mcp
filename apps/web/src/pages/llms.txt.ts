import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  const content = `# DevRel MCP by CodingCat.dev (https://devrel.codingcat.dev)

> Hosted Model Context Protocol (MCP) server for Developer Relations (DevRel) activity reporting and content analytics. Built on Cloudflare Workers, D1 (AES-256-GCM encrypted per-user credential vault), and MCP OAuth 2.1.

## MCP Connection Details

- **Streamable HTTP Endpoint**: \`https://devrel.codingcat.dev/mcp\`
- **OAuth Protected Resource Metadata**: \`https://devrel.codingcat.dev/.well-known/oauth-protected-resource/mcp\`
- **OAuth Authorization Server Metadata**: \`https://devrel.codingcat.dev/.well-known/oauth-authorization-server/api/auth\`
- **Dynamic Client Registration**: \`https://devrel.codingcat.dev/api/auth/oauth2/register\`
- **Required Scope**: \`mcp\` (plus \`offline_access\` for refresh tokens)
- **Authentication Methods**: Email Magic Link, Email 6-Digit OTP, CLI Terminal Verification URL (\`/cli-auth\`), and GitHub OAuth.

## Supported DevRel Programs & Analytics Integrations

- **Google Developer Experts (GDE — Advocu API)**: Submit content creation, public speaking, workshops, mentoring, product feedback, Googler interactions, and stories.
- **Microsoft MVP Portal API**: Submit video/webinar, blog/article, conference speaking, and book/e-book activities.
- **Content & Analytics Auto-Fetch**: Pull video views/likes from YouTube Data API v3, article views from Dev.to, publication post views from Hashnode GraphQL, and OSS repo stats from GitHub.
- **Ambassador & Community Programs**: AWS Community Builders, Docker Captains, Cypress Ambassadors, and custom Advocu program slugs, plus a unified D1 DevRel activity ledger.

## Key Links

- [Dashboard & Sign-In](https://devrel.codingcat.dev/)
- [Documentation & Tool Reference](https://devrel.codingcat.dev/docs)
- [Full LLM Documentation](https://devrel.codingcat.dev/llms-full.txt)
- [GitHub Repository](https://github.com/CodingCatDev/devrel-mcp)
`;
  return new Response(content, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
