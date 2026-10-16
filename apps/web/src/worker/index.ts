import { requireMcpAuth } from "@better-auth/mcp";
import { oauthProviderAuthServerMetadata, verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { type LoggedDevRelActivity, UnifiedActivityReportingServer } from "@codingcatdev/devrel-mcp";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { type HostedEnv, createAuth } from "./auth.js";
import {
  getConnectionStatus,
  loadCredentials,
  mergeCredentials,
  saveCredentials,
  validateCredentials,
} from "./credentials.js";
import { readDocumentation } from "./documents.js";

interface Env extends HostedEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  MCP_RATE_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

const json = (data: unknown, status = 200) => Response.json(data, { status });

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateUserCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const part1 = Array.from(bytes.slice(0, 4))
    .map((b) => chars[b % chars.length])
    .join("");
  const part2 = Array.from(bytes.slice(4, 8))
    .map((b) => chars[b % chars.length])
    .join("");
  return `${part1}-${part2}`;
}

async function resolveAuthenticatedUserId(
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
): Promise<{ id: string; email?: string; name?: string } | null> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer devrel_cli_")) {
    const rawToken = authHeader.slice("Bearer ".length).trim();
    const tokenHash = await sha256Hex(rawToken);
    const row = await env.DB.prepare(
      `SELECT cli_tokens.user_id as id, user.email as email, user.name as name
       FROM cli_tokens
       JOIN user ON user.id = cli_tokens.user_id
       WHERE cli_tokens.token_hash = ? AND cli_tokens.expires_at > ?`,
    )
      .bind(tokenHash, Date.now())
      .first<{ id: string; email: string; name: string }>();
    return row ?? null;
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

async function recordActivityInD1(env: Env, userId: string, activity: LoggedDevRelActivity) {
  const id = crypto.randomUUID();
  const createdAt = activity.createdAt || new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO activity_logs (id, user_id, program, activity_type, title, description, url, activity_date, metrics_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      userId,
      activity.program,
      activity.activityType,
      activity.title,
      activity.description ?? null,
      activity.url,
      activity.activityDate,
      activity.metrics ? JSON.stringify(activity.metrics) : null,
      activity.status || "logged",
      createdAt,
    )
    .run();
  return { ...activity, id, createdAt };
}

async function listActivitiesFromD1(
  env: Env,
  userId: string,
  filter?: { program?: string; limit?: number },
): Promise<LoggedDevRelActivity[]> {
  const limit = Math.min(Math.max(filter?.limit ?? 20, 1), 100);
  const query = filter?.program
    ? env.DB.prepare(
        `SELECT id, program, activity_type as activityType, title, description, url, activity_date as activityDate, metrics_json, status, created_at as createdAt
         FROM activity_logs WHERE user_id = ? AND program = ? ORDER BY activity_date DESC, created_at DESC LIMIT ?`,
      ).bind(userId, filter.program, limit)
    : env.DB.prepare(
        `SELECT id, program, activity_type as activityType, title, description, url, activity_date as activityDate, metrics_json, status, created_at as createdAt
         FROM activity_logs WHERE user_id = ? ORDER BY activity_date DESC, created_at DESC LIMIT ?`,
      ).bind(userId, limit);

  const { results } = await query.all<{
    id: string;
    program: string;
    activityType: string;
    title: string;
    description: string | null;
    url: string;
    activityDate: string;
    metrics_json: string | null;
    status: string;
    createdAt: string;
  }>();

  return (results || []).map((row) => ({
    id: row.id,
    program: row.program,
    activityType: row.activityType,
    title: row.title,
    ...(row.description ? { description: row.description } : {}),
    url: row.url,
    activityDate: row.activityDate,
    ...(row.metrics_json ? { metrics: JSON.parse(row.metrics_json) } : {}),
    status: row.status,
    createdAt: row.createdAt,
  }));
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const origin = new URL(env.BETTER_AUTH_URL).origin;
  if (url.origin !== origin) return json({ message: "Invalid host" }, 400);
  if (request.headers.has("origin") && request.headers.get("origin") !== origin) {
    return json({ message: "Origin not allowed" }, 403);
  }

  const auth = createAuth(env);

  if (
    url.pathname === "/.well-known/oauth-authorization-server" ||
    url.pathname === "/.well-known/oauth-authorization-server/api/auth"
  ) {
    return oauthProviderAuthServerMetadata(auth)(request);
  }
  if (
    url.pathname === "/.well-known/oauth-protected-resource" ||
    url.pathname === "/.well-known/oauth-protected-resource/mcp"
  ) {
    return auth.handler(request);
  }
  if (url.pathname.startsWith("/api/auth/")) return auth.handler(request);

  if (url.pathname === "/api/auth-providers" && request.method === "GET") {
    return json({
      emailMagicLink: true,
      emailOTP: true,
      github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
      google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      microsoft: Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET),
    });
  }

  if (url.pathname === "/api/authorization-request" && request.method === "POST") {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return json({ message: "Sign in required" }, 401);
    if (request.headers.get("origin") !== origin) return json({ message: "Origin required" }, 403);
    const body = (await request.json()) as { oauth_query?: unknown };
    if (
      typeof body.oauth_query !== "string" ||
      !(await verifyOAuthQueryParams(body.oauth_query, (await auth.$context).secret))
    ) {
      return json({ message: "Invalid authorization request. Reconnect your MCP client." }, 400);
    }
    const params = new URLSearchParams(body.oauth_query);
    const client = await auth.api.getOAuthClientPublic({
      headers: request.headers,
      query: { client_id: params.get("client_id") || "" },
    });
    return json({
      client: client.client_name || params.get("client_id"),
      scope: params.get("scope"),
      redirectUri: params.get("redirect_uri"),
    });
  }

  // CLI Terminal Link Login Endpoints
  if (url.pathname === "/api/cli/start" && request.method === "POST") {
    let clientName = "devrel-mcp-cli";
    try {
      const body = (await request.json()) as { clientName?: unknown };
      if (typeof body?.clientName === "string" && body.clientName.trim()) {
        clientName = body.clientName.trim().slice(0, 64);
      }
    } catch {
      // Default client name
    }
    const deviceCode = crypto.randomUUID() + "-" + crypto.randomUUID();
    const userCode = generateUserCode();
    const now = Date.now();
    const expiresAt = now + 600_000;
    await env.DB.prepare(
      `INSERT INTO cli_auth_sessions (device_code, user_code, client_name, status, expires_at, created_at)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
    )
      .bind(deviceCode, userCode, clientName, expiresAt, now)
      .run();

    return json({
      deviceCode,
      userCode,
      verificationUri: `${origin}/cli-auth?code=${encodeURIComponent(userCode)}`,
      expiresIn: 600,
      interval: 2,
    });
  }

  if (url.pathname === "/api/cli/approve" && request.method === "POST") {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return json({ message: "Sign in required" }, 401);
    if (request.headers.get("origin") !== origin) return json({ message: "Origin required" }, 403);
    const body = (await request.json()) as { userCode?: unknown };
    const userCode = typeof body.userCode === "string" ? body.userCode.trim().toUpperCase() : "";
    if (!userCode) return json({ message: "Verification code required" }, 400);

    const pending = await env.DB.prepare(
      "SELECT device_code, expires_at, status FROM cli_auth_sessions WHERE user_code = ?",
    )
      .bind(userCode)
      .first<{ device_code: string; expires_at: number; status: string }>();

    if (!pending || pending.status !== "pending" || pending.expires_at < Date.now()) {
      return json({ message: "Invalid or expired CLI verification code." }, 400);
    }

    const rawBytes = crypto.getRandomValues(new Uint8Array(24));
    const rawToken =
      "devrel_cli_" +
      Array.from(rawBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    const tokenHash = await sha256Hex(rawToken);
    const now = Date.now();

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO cli_tokens (token_hash, user_id, label, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(tokenHash, session.user.id, "CLI session", now, now + 30 * 24 * 3600 * 1000),
      env.DB.prepare(
        "UPDATE cli_auth_sessions SET status = 'approved', user_id = ?, cli_token = ? WHERE device_code = ?",
      ).bind(session.user.id, rawToken, pending.device_code),
    ]);

    return json({ success: true });
  }

  if (url.pathname === "/api/cli/poll" && request.method === "POST") {
    const body = (await request.json()) as { deviceCode?: unknown };
    const deviceCode = typeof body.deviceCode === "string" ? body.deviceCode.trim() : "";
    if (!deviceCode) return json({ message: "deviceCode required" }, 400);

    const row = await env.DB.prepare(
      `SELECT cli_auth_sessions.status as status, cli_auth_sessions.cli_token as cliToken, cli_auth_sessions.expires_at as expiresAt, user.email as email
       FROM cli_auth_sessions
       LEFT JOIN user ON user.id = cli_auth_sessions.user_id
       WHERE cli_auth_sessions.device_code = ?`,
    )
      .bind(deviceCode)
      .first<{ status: string; cliToken: string | null; expiresAt: number; email: string | null }>();

    if (!row || row.expiresAt < Date.now()) {
      return json({ message: "CLI session expired or not found" }, 400);
    }
    if (row.status === "pending") {
      return json({ status: "pending" }, 202);
    }
    if (row.status === "approved" && row.cliToken) {
      await env.DB.prepare("UPDATE cli_auth_sessions SET cli_token = NULL, status = 'consumed' WHERE device_code = ?")
        .bind(deviceCode)
        .run();
      return json({ status: "approved", cliToken: row.cliToken, email: row.email });
    }
    return json({ message: "CLI session already consumed" }, 400);
  }

  // Provider Connections Vault
  if (url.pathname === "/api/connections") {
    const user = await resolveAuthenticatedUserId(request, env, auth);
    if (!user) return json({ message: "Sign in required" }, 401);
    const userId = user.id;

    if (request.method === "GET") {
      const credentials = await loadCredentials(env, userId);
      return json(getConnectionStatus(credentials));
    }

    if (request.headers.get("origin") !== origin) return json({ message: "Origin required" }, 403);

    if (request.method === "DELETE") {
      const provider = url.searchParams.get("provider");
      if (!provider) {
        await env.DB.prepare("DELETE FROM provider_credentials WHERE user_id = ?").bind(userId).run();
        return json({ success: true });
      }
      const current = await loadCredentials(env, userId);
      if (provider in current) {
        delete (current as Record<string, unknown>)[provider];
      } else if (current.programs && provider in current.programs) {
        delete (current.programs as Record<string, unknown>)[provider];
      }
      await saveCredentials(env, userId, current);
      return json({ success: true });
    }

    if (request.method === "PUT" || request.method === "PATCH") {
      if (!request.headers.get("content-type")?.startsWith("application/json")) {
        return json({ message: "JSON required" }, 415);
      }
      let credentials: ReturnType<typeof validateCredentials>;
      try {
        credentials = validateCredentials(await request.json());
      } catch {
        return json({ message: "Provide valid tokens and a positive integer MVP profile ID." }, 400);
      }
      if (request.method === "PATCH") {
        await mergeCredentials(env, userId, credentials);
      } else {
        await saveCredentials(env, userId, credentials);
      }
      return json({ success: true });
    }

    return json({ message: "Method not allowed" }, 405);
  }

  // Provider OAuth Connect Flow (for connecting external APIs after email/CLI login)
  const oauthStartMatch = url.pathname.match(/^\/api\/provider-oauth\/(github|youtube|microsoft)\/start$/);
  if (oauthStartMatch && request.method === "GET") {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) return json({ message: "Sign in required" }, 401);
    const provider = oauthStartMatch[1] as "github" | "youtube" | "microsoft";
    const state = crypto.randomUUID();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 600_000).toISOString();
    await env.DB.prepare(
      "INSERT INTO verification (id, identifier, value, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(
        crypto.randomUUID(),
        `provider_oauth:${state}`,
        JSON.stringify({ userId: session.user.id, provider }),
        expiresAt,
        now,
        now,
      )
      .run();

    const callbackUri = `${origin}/api/provider-oauth/${provider}/callback`;
    let authUrl: URL;
    if (provider === "github") {
      if (!env.GITHUB_CLIENT_ID) return json({ message: "GitHub OAuth not configured" }, 400);
      authUrl = new URL("https://github.com/login/oauth/authorize");
      authUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", callbackUri);
      authUrl.searchParams.set("scope", "read:user repo");
      authUrl.searchParams.set("state", state);
    } else if (provider === "youtube") {
      if (!env.GOOGLE_CLIENT_ID) return json({ message: "Google/YouTube OAuth not configured" }, 400);
      authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", callbackUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/youtube.readonly");
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("state", state);
    } else {
      if (!env.MICROSOFT_CLIENT_ID) return json({ message: "Microsoft OAuth not configured" }, 400);
      authUrl = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
      authUrl.searchParams.set("client_id", env.MICROSOFT_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", callbackUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "openid profile offline_access");
      authUrl.searchParams.set("state", state);
    }
    return Response.redirect(authUrl.toString(), 302);
  }

  const oauthCallbackMatch = url.pathname.match(/^\/api\/provider-oauth\/(github|youtube|microsoft)\/callback$/);
  if (oauthCallbackMatch && request.method === "GET") {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) return json({ message: "Sign in required" }, 401);
    const provider = oauthCallbackMatch[1] as "github" | "youtube" | "microsoft";
    const state = url.searchParams.get("state") || "";
    const code = url.searchParams.get("code") || "";
    if (!state || !code) return json({ message: "Missing OAuth state or code" }, 400);

    const record = await env.DB.prepare("SELECT id, value, expiresAt FROM verification WHERE identifier = ?")
      .bind(`provider_oauth:${state}`)
      .first<{ id: string; value: string; expiresAt: string }>();
    if (!record) return json({ message: "Invalid OAuth state" }, 400);
    await env.DB.prepare("DELETE FROM verification WHERE id = ?").bind(record.id).run();

    const parsed = JSON.parse(record.value) as { userId: string; provider: string };
    if (parsed.userId !== session.user.id || parsed.provider !== provider || new Date(record.expiresAt) < new Date()) {
      return json({ message: "Expired or mismatched OAuth state" }, 400);
    }

    const callbackUri = `${origin}/api/provider-oauth/${provider}/callback`;
    let tokenUrl = "";
    const params = new URLSearchParams({ code, redirect_uri: callbackUri, grant_type: "authorization_code" });
    if (provider === "github") {
      tokenUrl = "https://github.com/login/oauth/access_token";
      params.set("client_id", env.GITHUB_CLIENT_ID || "");
      params.set("client_secret", env.GITHUB_CLIENT_SECRET || "");
    } else if (provider === "youtube") {
      tokenUrl = "https://oauth2.googleapis.com/token";
      params.set("client_id", env.GOOGLE_CLIENT_ID || "");
      params.set("client_secret", env.GOOGLE_CLIENT_SECRET || "");
    } else {
      tokenUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
      params.set("client_id", env.MICROSOFT_CLIENT_ID || "");
      params.set("client_secret", env.MICROSOFT_CLIENT_SECRET || "");
    }

    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    if (!tokenRes.ok) return json({ message: "Failed to exchange provider OAuth code" }, 400);
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) return json({ message: "No access token returned by provider" }, 400);

    if (provider === "github") {
      await mergeCredentials(env, session.user.id, { github: { accessToken: tokenData.access_token } });
    } else if (provider === "youtube") {
      await mergeCredentials(env, session.user.id, { youtube: { accessToken: tokenData.access_token } });
    }
    return Response.redirect(`${origin}/?connected=${provider}`, 302);
  }

  // Activity Ledger Endpoint
  if (url.pathname === "/api/activities" && request.method === "GET") {
    const user = await resolveAuthenticatedUserId(request, env, auth);
    if (!user) return json({ message: "Sign in required" }, 401);
    const program = url.searchParams.get("program") || undefined;
    const activities = await listActivitiesFromD1(env, user.id, { program, limit: 50 });
    return json({ activities });
  }

  // Streamable HTTP MCP Endpoint
  if (url.pathname === "/mcp") {
    return requireMcpAuth(
      auth,
      async (authenticatedRequest, claims) => {
        if (!claims.sub) return json({ message: "User identity required" }, 401);
        const userId = claims.sub;
        if (!(await env.MCP_RATE_LIMITER.limit({ key: userId })).success) {
          return new Response("Too many requests", { status: 429, headers: { "Retry-After": "60" } });
        }
        const credentials = await loadCredentials(env, userId);
        const server = new UnifiedActivityReportingServer({
          credentials,
          readDocumentation,
          exposeProviderErrors: false,
          onLogActivity: (activity) => recordActivityInD1(env, userId, activity),
          onListActivities: (filter) => listActivitiesFromD1(env, userId, filter),
        });
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        try {
          await server.connect(transport);
          return await transport.handleRequest(authenticatedRequest);
        } finally {
          await server.close();
        }
      },
      { resource: `${origin}/mcp`, requiredScopes: ["mcp"] },
    )(request);
  }

  // Serve Astro pre-rendered pages and static assets
  if (request.method === "GET" || request.method === "HEAD") {
    let assetPath = url.pathname;
    if (assetPath === "/") {
      assetPath = "/index.html";
    } else if (["/consent", "/docs", "/cli-auth"].includes(assetPath.replace(/\/$/, ""))) {
      assetPath = `${assetPath.replace(/\/$/, "")}/index.html`;
    }
    const assetUrl = new URL(assetPath, origin);
    const assetResponse = await env.ASSETS.fetch(new Request(assetUrl, request));
    if (assetResponse.status !== 404) {
      return assetResponse;
    }
  }

  return json({ message: "Not found" }, 404);
}

export default {
  async fetch(incoming: Request, env: Env): Promise<Response> {
    let request = incoming;
    let response: Response;
    try {
      if (request.body) {
        const reader = request.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > 65536) {
            await reader.cancel();
            return json({ message: "Request too large" }, 413);
          }
          chunks.push(value);
        }
        const body = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.length;
        }
        request = new Request(request, { body });
      }
      response = await route(request, env);
    } catch {
      response = json({ message: "Service unavailable. Please try again." }, 500);
    }
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    );
    if (new URL(request.url).protocol === "https:") {
      headers.set("Strict-Transport-Security", "max-age=31536000");
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
