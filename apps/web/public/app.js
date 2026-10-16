const element = (id) => document.getElementById(id) || { hidden: true, textContent: "", value: "", reset: () => {} };
const query = location.search.slice(1);
const oauthQuery = new URLSearchParams(query).get("oauth_query") || query;
const hasOAuthRequest = new URLSearchParams(oauthQuery).has("client_id");

const webMcpController = typeof AbortController !== "undefined" ? new AbortController() : null;
if (typeof window !== "undefined" && typeof window.addEventListener === "function" && webMcpController) {
  window.addEventListener("pagehide", () => webMcpController.abort());
}

function registerWebMcpTools() {
  const modelContext =
    (typeof document !== "undefined" && document.modelContext) ||
    (typeof navigator !== "undefined" && navigator.modelContext);
  if (!modelContext || typeof modelContext.registerTool !== "function") return;

  const tools = [
    {
      name: "get_mcp_connection_config",
      description:
        "Get the MCP server configuration JSON, Streamable HTTP endpoint URL, and OAuth 2.1 discovery URLs to connect Claude Code, Cursor, VS Code, Windsurf, or Gemini CLI to DevRel MCP.",
      inputSchema: {
        type: "object",
        properties: {
          client: {
            type: "string",
            enum: ["claude-code", "cursor", "vscode", "windsurf", "generic"],
            description: "Target MCP client application to generate configuration for.",
          },
        },
      },
      execute: async (input = {}) => {
        const endpoint = `${location.origin}/mcp`;
        return {
          client: input.client || "generic",
          endpoint,
          oauthProtectedResource: `${location.origin}/.well-known/oauth-protected-resource/mcp`,
          oauthAuthorizationServer: `${location.origin}/.well-known/oauth-authorization-server`,
          mcpServersConfig: {
            mcpServers: {
              "devrel-mcp": {
                type: "http",
                url: endpoint,
              },
            },
          },
        };
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "list_devrel_mcp_tools",
      description:
        "List the 19 DevRel activity reporting and content analytics MCP tools available on this server, optionally filtered by program (gde, mvp, analytics, ambassador, docs).",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["all", "gde", "mvp", "analytics", "ambassador", "docs"],
            description: "Filter tools by DevRel program or capability category.",
          },
        },
      },
      execute: async (input = {}) => {
        const catalog = [
          { name: "submit_gde_content_creation", category: "gde", description: "Submit Google GDE content creation draft via Advocu" },
          { name: "submit_gde_public_speaking", category: "gde", description: "Submit Google GDE public speaking draft via Advocu" },
          { name: "submit_gde_workshop", category: "gde", description: "Submit Google GDE workshop draft via Advocu" },
          { name: "submit_gde_mentoring", category: "gde", description: "Submit Google GDE mentoring draft via Advocu" },
          { name: "submit_gde_product_feedback", category: "gde", description: "Submit Google GDE product feedback draft via Advocu" },
          { name: "submit_gde_interaction_with_googlers", category: "gde", description: "Submit Google GDE interaction with Googlers draft" },
          { name: "submit_gde_stories", category: "gde", description: "Submit Google GDE impact story draft via Advocu" },
          { name: "submit_mvp_video_activity", category: "mvp", description: "Submit Microsoft MVP video activity" },
          { name: "submit_mvp_blog_activity", category: "mvp", description: "Submit Microsoft MVP blog/article activity" },
          { name: "submit_mvp_speaking_activity", category: "mvp", description: "Submit Microsoft MVP conference/speaking activity" },
          { name: "submit_mvp_book_activity", category: "mvp", description: "Submit Microsoft MVP book/publication activity" },
          { name: "fetch_youtube_video_metrics", category: "analytics", description: "Fetch YouTube video views, likes, comments, and publish date" },
          { name: "fetch_devto_article_metrics", category: "analytics", description: "Fetch Dev.to article views, reactions, and tags" },
          { name: "fetch_hashnode_post_metrics", category: "analytics", description: "Fetch Hashnode blog post views and reactions via GraphQL" },
          { name: "fetch_github_repo_metrics", category: "analytics", description: "Fetch GitHub repository stars, forks, issues, and release downloads" },
          { name: "log_devrel_activity", category: "ambassador", description: "Log activity to AWS Community Builders, Docker Captains, Cypress Ambassadors, or unified D1 ledger" },
          { name: "list_logged_devrel_activities", category: "ambassador", description: "List and export logged DevRel activities from the D1 ledger" },
          { name: "get_docs", category: "docs", description: "Read bundled API documentation for GDE and MVP schemas" },
          { name: "discover_program_options", category: "docs", description: "Discover valid activity types, tags, and countries for GDE and MVP" },
        ];
        const category = input.category || "all";
        return category === "all" ? catalog : catalog.filter((t) => t.category === category);
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "start_cli_device_auth",
      description:
        "Start a CLI terminal device authorization session and receive a verification URI and 8-character user code.",
      inputSchema: {
        type: "object",
        properties: {
          clientName: {
            type: "string",
            description: "Name of the CLI or agent client requesting authorization.",
          },
        },
      },
      execute: async (input = {}) => {
        return await api("/api/cli/start", { clientName: input.clientName || "webmcp-agent" }, "POST");
      },
    },
  ];

  for (const tool of tools) {
    try {
      const options = webMcpController ? { signal: webMcpController.signal } : undefined;
      Promise.resolve(modelContext.registerTool(tool, options)).catch(() => {});
    } catch {
      // Ignore registration errors on older preview builds
    }
  }
}

registerWebMcpTools();

async function api(path, body, method = "POST") {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Request failed. Please try again.");
  return data;
}

function report(error) {
  element("message").textContent = error.message || "Request failed.";
}

async function connections() {
  const data = await api("/api/connections", undefined, "GET");
  const extras = [];
  if (data.youtube) extras.push("YouTube");
  if (data.devto) extras.push("Dev.to");
  if (data.hashnode) extras.push("Hashnode");
  if (data.github) extras.push("GitHub");
  if (data.programs?.awsCommunity) extras.push("AWS Community");
  if (data.programs?.dockerCaptains) extras.push("Docker Captains");
  if (data.programs?.cypressAmbassadors) extras.push("Cypress");
  if (data.programs?.customAdvocu) extras.push("Custom Advocu");
  const suffix = extras.length > 0 ? ` Extra connected: ${extras.join(", ")}.` : "";
  element("connections").textContent =
    `Advocu: ${data.gde ? "connected" : "not connected"}. MVP: ${data.mvp ? "connected" : "not connected"}.${suffix}`;
}

async function authorize(accept) {
  const data = await api("/api/auth/oauth2/consent", { accept, oauth_query: oauthQuery });
  if (data.url) location.assign(data.url);
  else throw new Error("Authorization could not be completed. Reconnect your MCP client.");
}

element("login").onclick = async () => {
  try {
    const data = await api("/api/auth/sign-in/social", {
      provider: "github",
      callbackURL: `${location.origin}/${hasOAuthRequest ? `?${query}` : ""}`,
      ...(hasOAuthRequest ? { oauth_query: oauthQuery } : {}),
    });
    if (data.url) location.assign(data.url);
  } catch (error) {
    report(error);
  }
};

element("email-auth-form").onsubmit = async (event) => {
  event.preventDefault();
  const run = async () => {
    const email = element("auth-email").value.trim();
    if (!email) throw new Error("Please enter your email address.");
    const callbackURL = `${location.origin}/${hasOAuthRequest ? `?${query}` : ""}`;
    await api("/api/auth/sign-in/magic-link", { email, callbackURL });
    const msg = `Magic sign-in link sent to ${email}. Check your inbox!`;
    element("message").textContent = msg;
    return msg;
  };
  const promise = run().catch((error) => {
    report(error);
    return error.message || "Request failed.";
  });
  if (event.agentInvoked && typeof event.respondWith === "function") {
    event.respondWith(promise);
  }
};

element("send-otp").onclick = async () => {
  try {
    const email = element("auth-email").value.trim();
    if (!email) throw new Error("Please enter your email address first.");
    await api("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" });
    element("otp-verify-form").hidden = false;
    element("message").textContent = `6-digit verification code sent to ${email}.`;
  } catch (error) {
    report(error);
  }
};

element("otp-verify-form").onsubmit = async (event) => {
  event.preventDefault();
  const run = async () => {
    const email = element("auth-email").value.trim();
    const otp = element("auth-otp").value.trim();
    await api("/api/auth/sign-in/email-otp", { email, otp });
    location.assign(`${location.origin}/${hasOAuthRequest ? `?${query}` : ""}`);
    return "Signed in via Email OTP.";
  };
  const promise = run().catch((error) => {
    report(error);
    return error.message || "Request failed.";
  });
  if (event.agentInvoked && typeof event.respondWith === "function") {
    event.respondWith(promise);
  }
};

element("credentials").onsubmit = async (event) => {
  event.preventDefault();
  const run = async () => {
    const credentials = {};
    if (element("gde").value.trim()) credentials.gde = { accessToken: element("gde").value.trim() };
    if (element("mvp").value.trim()) {
      credentials.mvp = { accessToken: element("mvp").value.trim(), userProfileId: Number(element("profile").value) };
    }
    await api("/api/connections", credentials, "PUT");
    element("credentials").reset();
    await connections();
    const msg = "Connections saved.";
    element("message").textContent = msg;
    return msg;
  };
  const promise = run().catch((error) => {
    report(error);
    return error.message || "Request failed.";
  });
  if (event.agentInvoked && typeof event.respondWith === "function") {
    event.respondWith(promise);
  }
};

element("extended-credentials").onsubmit = async (event) => {
  event.preventDefault();
  const run = async () => {
    const patch = {};
    const yt = element("youtube-key").value.trim();
    if (yt) patch.youtube = { apiKey: yt };
    const devto = element("devto-key").value.trim();
    if (devto) patch.devto = { apiKey: devto };
    const hnToken = element("hashnode-token").value.trim();
    const hnHost = element("hashnode-host").value.trim();
    if (hnToken && hnHost) patch.hashnode = { accessToken: hnToken, publicationHost: hnHost };
    const gh = element("github-token").value.trim();
    if (gh) patch.github = { accessToken: gh };
    const aws = element("aws-handle").value.trim();
    if (aws) patch.programs = { awsCommunity: { handle: aws } };

    await api("/api/connections", patch, "PATCH");
    element("extended-credentials").reset();
    await connections();
    const msg = "Analytics and program connections updated.";
    element("message").textContent = msg;
    return msg;
  };
  const promise = run().catch((error) => {
    report(error);
    return error.message || "Request failed.";
  });
  if (event.agentInvoked && typeof event.respondWith === "function") {
    event.respondWith(promise);
  }
};

element("cli-approve-form").onsubmit = async (event) => {
  event.preventDefault();
  const run = async () => {
    const userCode = element("cli-user-code").value.trim();
    await api("/api/cli/approve", { userCode }, "POST");
    const msg = "CLI terminal session approved! You can return to your terminal.";
    element("message").textContent = msg;
    return msg;
  };
  const promise = run().catch((error) => {
    report(error);
    return error.message || "Request failed.";
  });
  if (event.agentInvoked && typeof event.respondWith === "function") {
    event.respondWith(promise);
  }
};

element("disconnect").onclick = async () => {
  try {
    await api("/api/connections", undefined, "DELETE");
    element("credentials").reset();
    await connections();
  } catch (error) {
    report(error);
  }
};
element("approve").onclick = () => authorize(true).catch(report);
element("deny").onclick = () => authorize(false).catch(report);
element("logout").onclick = async () => {
  try {
    await api("/api/auth/sign-out", {});
    location.assign("/");
  } catch (error) {
    report(error);
  }
};

async function start() {
  element("endpoint").textContent = `${location.origin}/mcp`;
  const urlCode = new URLSearchParams(query).get("code");
  if (urlCode && location.pathname.startsWith("/cli-auth")) {
    element("cli-user-code").value = urlCode;
  }
  const session = await api("/api/auth/get-session", undefined, "GET");
  if (!session?.user) {
    element("login").hidden = false;
    return;
  }
  element("auth-panel").hidden = true;
  element("account").hidden = false;
  element("identity").textContent = `Signed in as ${session.user.name || session.user.email}`;
  await connections();
  if (!hasOAuthRequest) return;
  if (!location.pathname.startsWith("/consent")) {
    const data = await api("/api/auth/oauth2/continue", { postLogin: true, oauth_query: oauthQuery });
    if (data.url) {
      const destination = new URL(data.url, location.origin);
      if (destination.origin === location.origin && destination.pathname === "/") {
        element("auth-panel").hidden = false;
        element("login").hidden = false;
        element("message").textContent = "Your MCP client requires a fresh sign-in. Sign in with GitHub to continue.";
      } else {
        location.assign(data.url);
      }
    }
    return;
  }
  const authorization = await api("/api/authorization-request", { oauth_query: oauthQuery });
  element("request").textContent =
    `Client: ${authorization.client}. Requested scopes: ${authorization.scope || "(none)"}. Callback: ${authorization.redirectUri || "(none)"}`;
  element("consent").hidden = false;
}

start().catch(report);
