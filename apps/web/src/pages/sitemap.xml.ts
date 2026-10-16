import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  const urls = ["/", "/docs", "/cli-auth", "/consent", "/llms.txt", "/llms-full.txt"];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (path) => `  <url>
    <loc>https://devrel.codingcat.dev${path}</loc>
    <changefreq>weekly</changefreq>
  </url>`,
  )
  .join("\n")}
</urlset>`;
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
