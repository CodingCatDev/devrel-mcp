import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  const content = `# DevRel MCP — Complete Technical & Tool Specification (https://devrel.codingcat.dev)

## Overview
DevRel MCP is a hosted Model Context Protocol (MCP) server and CLI created by CodingCat.dev that automates Developer Relations (DevRel) reporting across Google Developer Experts (GDE / Advocu), Microsoft MVP, AWS Community Builders, Docker Captains, Cypress Ambassadors, and content analytics platforms (YouTube, Dev.to, Hashnode, GitHub).

## Connect via Claude Code / Cursor / Windsurf
\`\`\`bash
claude mcp add --transport http devrel https://devrel.codingcat.dev/mcp
\`\`\`

## Connect or Sync Credentials via CLI
\`\`\`bash
npx @codingcatdev/devrel-mcp login
npx @codingcatdev/devrel-mcp push-credentials
\`\`\`

## Full Tool Catalog (19 Tools)
1. \`submit_gde_content_creation\` — Submit articles, videos, podcasts, or books to Google GDE (Advocu).
2. \`submit_gde_public_speaking\` — Submit speaking engagements to Google GDE (Advocu).
3. \`submit_gde_workshop\` — Submit workshops to Google GDE (Advocu).
4. \`submit_gde_mentoring\` — Submit mentoring sessions to Google GDE (Advocu).
5. \`submit_gde_product_feedback\` — Submit product feedback to Google GDE (Advocu).
6. \`submit_gde_googler_interaction\` — Submit Googler interactions to Google GDE (Advocu).
7. \`submit_gde_story\` — Submit community impact stories to Google GDE (Advocu).
8. \`submit_mvp_video\` — Submit video/livestream activities to Microsoft MVP.
9. \`submit_mvp_blog\` — Submit blog posts to Microsoft MVP.
10. \`submit_mvp_speaking\` — Submit speaking activities to Microsoft MVP.
11. \`submit_mvp_book\` — Submit book/e-book activities to Microsoft MVP.
12. \`fetch_youtube_video_stats\` — Fetch YouTube video views, likes, comments, and publish date.
13. \`fetch_devto_articles\` — Fetch Dev.to articles with page_views_count and reactions.
14. \`fetch_hashnode_posts\` — Fetch Hashnode blog posts with view counts.
15. \`fetch_github_activity\` — Fetch GitHub repository metrics and releases.
16. \`submit_ambassador_advocu_draft\` — Submit activity drafts to Docker Captains, Cypress Ambassadors, or custom Advocu programs.
17. \`log_devrel_activity\` — Log DevRel activities (including AWS Community Builders & CNCF) into your Cloudflare D1 activity ledger.
18. \`list_devrel_activities\` — List logged and submitted DevRel activities across programs.
19. \`list_documentation\` & \`get_documentation\` — Read built-in API documentation and schemas.
`;
  return new Response(content, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
