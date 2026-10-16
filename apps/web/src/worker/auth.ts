import { mcp } from "@better-auth/mcp";
import type { D1Database } from "@cloudflare/workers-types";
import { betterAuth } from "better-auth";
import { emailOTP, jwt, magicLink } from "better-auth/plugins";

export interface HostedEnv {
  DB: D1Database;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  CREDENTIAL_ENCRYPTION_KEY: string;
  PUBLIC_SITE_URL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
}

async function deliverAuthEmail(
  env: HostedEnv,
  origin: string,
  payload: { to: string; subject: string; html: string; url?: string; otp?: string },
) {
  const isLocal = origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");

  if (isLocal) {
    await env.DB.prepare(
      "INSERT INTO email_outbox (id, recipient, subject, url, otp, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(
        crypto.randomUUID(),
        payload.to.toLowerCase(),
        payload.subject,
        payload.url ?? null,
        payload.otp ?? null,
        Date.now(),
      )
      .run();
  }

  if (env.RESEND_API_KEY) {
    const from = env.RESEND_FROM_EMAIL || "DevRel MCP <auth@codingcat.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
      }),
    });
    if (!res.ok && !isLocal) {
      throw new Error("Failed to send authentication email");
    }
  }
}

export function resolveAllowedOrigins(env: HostedEnv): string[] {
  const primary = new URL(env.BETTER_AUTH_URL).origin;
  if (primary.startsWith("http://localhost:") || primary.startsWith("http://127.0.0.1:")) {
    return [primary];
  }
  const origins = new Set<string>([primary]);
  if (env.PUBLIC_SITE_URL) {
    try {
      origins.add(new URL(env.PUBLIC_SITE_URL).origin);
    } catch {
      // ignore
    }
  }
  return Array.from(origins);
}

export function createAuth(env: HostedEnv, activeOrigin?: string) {
  const origin = activeOrigin || new URL(env.BETTER_AUTH_URL).origin;
  const trustedOrigins = resolveAllowedOrigins(env);

  const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    socialProviders.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    };
  }
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }
  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
    socialProviders.microsoft = {
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
    };
  }

  return betterAuth({
    database: env.DB,
    baseURL: origin,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins,
    logger: { disabled: true },
    account: { encryptOAuthTokens: true },
    socialProviders,
    rateLimit: { enabled: true, storage: "database" },
    disabledPaths: ["/token"],
    plugins: [
      jwt(),
      magicLink({
        expiresIn: 600,
        sendMagicLink: async ({ email, url }) => {
          await deliverAuthEmail(env, origin, {
            to: email,
            subject: "Sign in to DevRel MCP (CodingCat.dev)",
            url,
            html: `<p>Click the link below to sign in to your DevRel MCP account:</p><p><a href="${url}">${url}</a></p><p>This link expires in 10 minutes.</p>`,
          });
        },
      }),
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        sendVerificationOTP: async ({ email, otp }) => {
          await deliverAuthEmail(env, origin, {
            to: email,
            subject: `Your DevRel MCP verification code: ${otp}`,
            otp,
            html: `<p>Your one-time verification code for DevRel MCP is:</p><h2 style="letter-spacing: 4px;">${otp}</h2><p>This code expires in 10 minutes.</p>`,
          });
        },
      }),
      mcp({
        resource: `${origin}/mcp`,
        loginPage: "/",
        consentPage: "/consent",
        scopes: ["mcp", "offline_access"],
        grantTypes: ["authorization_code", "refresh_token"],
        resources: [{ identifier: `${origin}/mcp`, allowedScopes: ["mcp"] }],
        clientRegistrationDefaultResources: [`${origin}/mcp`],
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultApplicationType: "infer",
        accessTokenExpiresIn: 900,
      }),
    ],
  });
}
