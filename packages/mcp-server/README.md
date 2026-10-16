# `@codingcatdev/devrel-mcp`

Unified Model Context Protocol (MCP) server and CLI for Developer Relations (DevRel) activity reporting and content analytics across:

- **Google Developer Experts (GDE)** via the Advocu Personal API (7 draft submission tools)
- **Microsoft MVP** via the MVP Community API (4 activity tools: Video, Blog, Speaking, Book)
- **Content Analytics Auto-Fetching**: YouTube Data API v3, Dev.to (Forem), Hashnode GraphQL, and GitHub REST API (4 tools)
- **Ambassador Programs & Unified D1 Ledger**: AWS Community Builders, Docker Captains, Cypress Ambassadors, and custom Advocu programs (2 tools)
- **Bundled Documentation & Schema Discovery** (2 tools)

Hosted platform: **[https://devrel.codingcat.dev](https://devrel.codingcat.dev)**

## Hosted MCP Endpoint (Recommended)

Connect any OAuth 2.1 MCP client (Claude Code, Cursor, VS Code, Windsurf, Gemini CLI) directly to:

```json
{
  "mcpServers": {
    "devrel-mcp": {
      "type": "http",
      "url": "https://devrel.codingcat.dev/mcp"
    }
  }
}
```

## CLI Terminal Login & Credential Sync

Authenticate from your terminal via a browser verification URL (`https://devrel.codingcat.dev/cli-auth`) and push local `.env` tokens to your AES-256-GCM encrypted Cloudflare D1 vault:

```bash
# 1. Authenticate via browser verification code
npx @codingcatdev/devrel-mcp login

# 2. Push local environment tokens to your encrypted D1 vault
npx @codingcatdev/devrel-mcp push-credentials
```

## Local Stdio Mode

```bash
npx -y @codingcatdev/devrel-mcp
```
