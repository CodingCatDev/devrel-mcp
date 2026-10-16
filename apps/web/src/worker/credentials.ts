import type { ProviderCredentials } from "@codingcatdev/devrel-mcp";
import type { HostedEnv } from "./auth.js";

async function encryptionKey(encoded: string) {
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("Invalid credential encryption key");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function cleanToken(value: unknown, label = "provider token"): string {
  if (typeof value !== "string" || !value.trim() || value.length > 16384 || /[\r\n]/.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value.trim();
}

function cleanShortText(value: unknown, label = "identifier"): string {
  if (typeof value !== "string" || !value.trim() || value.length > 256 || /[\r\n]/.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value.trim();
}

export function validateCredentials(input: unknown): ProviderCredentials {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid credentials");
  }
  const value = input as Record<string, unknown>;
  const result: ProviderCredentials = {};

  if (value.gde !== undefined && value.gde !== null) {
    const gde = value.gde as Record<string, unknown>;
    result.gde = { accessToken: cleanToken(gde?.accessToken, "Advocu token") };
  }

  if (value.mvp !== undefined && value.mvp !== null) {
    const mvp = value.mvp as Record<string, unknown>;
    const id = mvp?.userProfileId;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
      throw new Error("Invalid MVP profile ID");
    }
    result.mvp = { accessToken: cleanToken(mvp?.accessToken, "MVP token"), userProfileId: id };
  }

  if (value.youtube !== undefined && value.youtube !== null) {
    const yt = value.youtube as Record<string, unknown>;
    const apiKey = yt?.apiKey ? cleanToken(yt.apiKey, "YouTube API key") : undefined;
    const accessToken = yt?.accessToken ? cleanToken(yt.accessToken, "YouTube OAuth token") : undefined;
    if (!apiKey && !accessToken) {
      throw new Error("YouTube requires an API key or OAuth access token");
    }
    result.youtube = {
      ...(apiKey ? { apiKey } : {}),
      ...(accessToken ? { accessToken } : {}),
      ...(yt?.channelId ? { channelId: cleanShortText(yt.channelId, "YouTube channel ID") } : {}),
    };
  }

  if (value.devto !== undefined && value.devto !== null) {
    const devto = value.devto as Record<string, unknown>;
    result.devto = {
      apiKey: cleanToken(devto?.apiKey, "Dev.to API key"),
      ...(devto?.username ? { username: cleanShortText(devto.username, "Dev.to username") } : {}),
    };
  }

  if (value.hashnode !== undefined && value.hashnode !== null) {
    const hn = value.hashnode as Record<string, unknown>;
    result.hashnode = {
      accessToken: cleanToken(hn?.accessToken, "Hashnode token"),
      publicationHost: cleanShortText(hn?.publicationHost, "Hashnode publication host"),
    };
  }

  if (value.github !== undefined && value.github !== null) {
    const gh = value.github as Record<string, unknown>;
    result.github = {
      accessToken: cleanToken(gh?.accessToken, "GitHub token"),
      ...(gh?.username ? { username: cleanShortText(gh.username, "GitHub username") } : {}),
    };
  }

  if (value.programs !== undefined && value.programs !== null) {
    const programs = value.programs as Record<string, unknown>;
    const validatedPrograms: NonNullable<ProviderCredentials["programs"]> = {};

    if (programs.awsCommunity && typeof programs.awsCommunity === "object") {
      const aws = programs.awsCommunity as Record<string, unknown>;
      validatedPrograms.awsCommunity = {
        handle: cleanShortText(aws.handle, "AWS Community handle"),
      };
    }

    if (programs.dockerCaptains && typeof programs.dockerCaptains === "object") {
      const dc = programs.dockerCaptains as Record<string, unknown>;
      validatedPrograms.dockerCaptains = {
        accessToken: cleanToken(dc.accessToken, "Docker Captains token"),
        ...(dc.programSlug ? { programSlug: cleanShortText(dc.programSlug, "program slug") } : {}),
      };
    }

    if (programs.cypressAmbassadors && typeof programs.cypressAmbassadors === "object") {
      const cy = programs.cypressAmbassadors as Record<string, unknown>;
      validatedPrograms.cypressAmbassadors = {
        accessToken: cleanToken(cy.accessToken, "Cypress Ambassadors token"),
        ...(cy.programSlug ? { programSlug: cleanShortText(cy.programSlug, "program slug") } : {}),
      };
    }

    if (programs.customAdvocu && typeof programs.customAdvocu === "object") {
      const ca = programs.customAdvocu as Record<string, unknown>;
      validatedPrograms.customAdvocu = {
        accessToken: cleanToken(ca.accessToken, "Custom Advocu token"),
        programSlug: cleanShortText(ca.programSlug, "Custom Advocu program slug"),
      };
    }

    if (Object.keys(validatedPrograms).length > 0) {
      result.programs = validatedPrograms;
    }
  }

  return result;
}

export async function saveCredentials(env: HostedEnv, userId: string, credentials: ProviderCredentials) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) },
    await encryptionKey(env.CREDENTIAL_ENCRYPTION_KEY),
    new TextEncoder().encode(JSON.stringify(credentials)),
  );
  const encoded = btoa(String.fromCharCode(...iv, ...new Uint8Array(ciphertext)));
  await env.DB.prepare(
    `INSERT INTO provider_credentials (user_id, ciphertext, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET ciphertext = excluded.ciphertext, updated_at = excluded.updated_at`,
  )
    .bind(userId, encoded, new Date().toISOString())
    .run();
}

export async function loadCredentials(env: HostedEnv, userId: string): Promise<ProviderCredentials> {
  const row = await env.DB.prepare("SELECT ciphertext FROM provider_credentials WHERE user_id = ?")
    .bind(userId)
    .first<{ ciphertext: string }>();
  if (!row) return {};
  const bytes = Uint8Array.from(atob(row.ciphertext), (char) => char.charCodeAt(0));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: new TextEncoder().encode(userId) },
    await encryptionKey(env.CREDENTIAL_ENCRYPTION_KEY),
    bytes.slice(12),
  );
  return validateCredentials(JSON.parse(new TextDecoder().decode(plaintext)));
}

export async function mergeCredentials(env: HostedEnv, userId: string, patch: ProviderCredentials) {
  const current = await loadCredentials(env, userId);
  const merged: ProviderCredentials = {
    ...current,
    ...patch,
    programs:
      current.programs || patch.programs
        ? {
            ...(current.programs || {}),
            ...(patch.programs || {}),
          }
        : undefined,
  };
  await saveCredentials(env, userId, merged);
  return merged;
}

export function getConnectionStatus(credentials: ProviderCredentials) {
  return {
    gde: !!credentials.gde,
    mvp: !!credentials.mvp,
    youtube: !!credentials.youtube,
    devto: !!credentials.devto,
    hashnode: !!credentials.hashnode,
    github: !!credentials.github,
    programs: {
      awsCommunity: !!credentials.programs?.awsCommunity,
      dockerCaptains: !!credentials.programs?.dockerCaptains,
      cypressAmbassadors: !!credentials.programs?.cypressAmbassadors,
      customAdvocu: !!credentials.programs?.customAdvocu,
    },
  };
}
