import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  const robots = `User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

Sitemap: https://devrel.codingcat.dev/sitemap.xml
`;
  return new Response(robots, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
