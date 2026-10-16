import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
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

Sitemap: https://devrel.codingcat.dev/sitemap.xml
Agentmap: https://devrel.codingcat.dev/.well-known/ai-catalog.json
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
