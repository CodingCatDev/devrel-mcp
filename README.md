# 🐾 DevRel MCP (`devrel.codingcat.dev`)

A production-ready **pnpm monorepo** for **Developer Relations (DevRel) Activity Reporting & Analytics** over the **Model Context Protocol (MCP)**.

Hosted on **Cloudflare Workers + D1 + Astro** at **`https://devrel.codingcat.dev`** with full **MCP OAuth 2.1** (Protected Resource Metadata, Dynamic Client Registration, PKCE `S256`, explicit user consent) and **AES-256-GCM encrypted per-user credential storage**.

---

## 📦 Monorepo Architecture

```text
devrel-mcp/
├── apps/
│   └── web/                      # @codingcatdev/devrel-web (Astro AEO Site + Cloudflare Worker + D1)
│       ├── src/pages/            # Pre-rendered Astro pages (/, /docs, /consent, /cli-auth, /llms.txt, /sitemap.xml)
│       ├── src/worker/           # Cloudflare Worker (/mcp Streamable HTTP, Better Auth, AES-256-GCM D1 vault)
│       ├── migrations/           # Cloudflare D1 SQL migrations (Better Auth + OAuth 2.1 + Provider Vault + CLI Auth)
│       └── tests/hosted.spec.ts  # End-to-end Playwright + Wrangler D1 test suite
└── packages/
    └── mcp-server/               # @codingcatdev/devrel-mcp (Core MCP Server + CLI + Local Stdio)
        ├── src/unifiedServer.ts  # Unified MCP Server (19 tools across GDE, MVP, YouTube, Dev.to, Hashnode, GitHub, AWS)
        ├── src/index.ts          # CLI (`devrel-mcp login`, `devrel-mcp push-credentials`) & local stdio entry point
        └── docs/                 # Built-in API reference & MCP resources
```

---

## ✨ Comparison with Original PR #1 & New Capabilities

1. **pnpm Monorepo + Astro AEO Frontend (`apps/web` + `packages/mcp-server`)**:
   - Upgraded from a single package with raw HTML into a `pnpm` workspace serving an **Answer Engine Optimized (AEO)** Astro site (`Schema.org` JSON-LD `SoftwareApplication`, `WebAPI`, `FAQPage`, `/llms.txt`, `/llms-full.txt`, `/robots.txt`, `/sitemap.xml`) alongside the `/mcp` Streamable HTTP Worker.
2. **Email Magic Link, 6-Digit Email OTP, CLI Terminal Verification URL, and Social Login**:
   - **Email Magic Link & Email OTP** via Better Auth (`magicLink` + `emailOTP` plugins) with Resend integration and local D1 dev outbox.
   - **CLI Terminal Link Flow (`/cli-auth`)**: Run `npx @codingcatdev/devrel-mcp login` in any terminal to get a clickable verification URL (`https://devrel.codingcat.dev/cli-auth?code=XXXX-YYYY`), approve in the browser, and push fresh tokens (`npx @codingcatdev/devrel-mcp push-credentials`) directly to your encrypted D1 vault.
   - **GitHub / Google / Microsoft OAuth** for both sign-in and 1-click provider OAuth connections (`/api/provider-oauth/:provider/start`).
3. **Complete 19-Tool DevRel & Analytics Suite**:
   - **Google GDE (Advocu — all 7 endpoints)**: `submit_gde_content_creation`, `submit_gde_public_speaking`, `submit_gde_workshop`, `submit_gde_mentoring`, `submit_gde_product_feedback`, `submit_gde_googler_interaction`, `submit_gde_story` (completing the missing GDE handlers from the upstream `unifiedServer.ts`).
   - **Microsoft MVP (all 4 activity types)**: `submit_mvp_video`, `submit_mvp_blog`, `submit_mvp_speaking`, `submit_mvp_book`.
   - **Content & Analytics Auto-Fetch (4 tools)**: `fetch_youtube_video_stats`, `fetch_devto_articles`, `fetch_hashnode_posts`, `fetch_github_activity`.
   - **Additional DevRel & Ambassador Programs (4 tools)**: `submit_ambassador_advocu_draft` (Docker Captains, Cypress Ambassadors, Custom Advocu), `log_devrel_activity`, `list_devrel_activities` (AWS Community Builders, CNCF, cross-program D1 ledger), plus `list_documentation` & `get_documentation`.
4. **Granular Encrypted Credential Storage in Cloudflare D1**:
   - Uses Web Crypto `AES-256-GCM` with a 32-byte key (`CREDENTIAL_ENCRYPTION_KEY`), random 12-byte IV, and AEAD `additionalData` bound to `user.id`.
   - Supports non-destructive `PATCH /api/connections` updates and per-provider disconnect (`DELETE /api/connections?provider=...`) in addition to full `PUT /api/connections`.

---

## 🚀 Quick Start (Local Hosted Development)

### Prerequisites
- Node.js **22.12+**
- `pnpm` **9+**

```bash
# 1. Install dependencies across the monorepo
pnpm install

# 2. Configure local Worker secrets
cp .dev.vars.example apps/web/.dev.vars
# Edit apps/web/.dev.vars and set two independent 32-byte base64 secrets:
# openssl rand -base64 32

# 3. Apply D1 migrations locally
pnpm db:migrate:local

# 4. Build packages & start local Cloudflare Worker at http://localhost:8787
pnpm dev:hosted
```

### Run End-to-End Tests
```bash
pnpm test
```

---

## ☁️ Deploying to `devrel.codingcat.dev`

1. Authenticate Wrangler and create the production D1 database:
   ```bash
   pnpm --filter @codingcatdev/devrel-web exec wrangler login
   pnpm --filter @codingcatdev/devrel-web exec wrangler d1 create devrel-mcp
   ```
2. Update `database_id` in [`apps/web/wrangler.jsonc`](apps/web/wrangler.jsonc) with the returned D1 database ID.
3. Configure production secrets:
   ```bash
   cd apps/web
   npx wrangler secret put BETTER_AUTH_SECRET --env production
   npx wrangler secret put CREDENTIAL_ENCRYPTION_KEY --env production
   npx wrangler secret put RESEND_API_KEY --env production
   # Optional OAuth providers:
   npx wrangler secret put GITHUB_CLIENT_ID --env production
   npx wrangler secret put GITHUB_CLIENT_SECRET --env production
   ```
4. Apply remote D1 migrations and deploy:
   ```bash
   npx wrangler d1 migrations apply DB --remote --env production
   pnpm build && npx wrangler deploy --env production
   ```
5. Connect your MCP client to `https://devrel.codingcat.dev/mcp`:
   ```bash
   claude mcp add --transport http devrel https://devrel.codingcat.dev/mcp
   ```
