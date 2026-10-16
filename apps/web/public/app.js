const element = (id) => document.getElementById(id) || { hidden: true, textContent: "", value: "", reset: () => {} };
const query = location.search.slice(1);
const oauthQuery = new URLSearchParams(query).get("oauth_query") || query;
const hasOAuthRequest = new URLSearchParams(oauthQuery).has("client_id");

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
  try {
    const email = element("auth-email").value.trim();
    if (!email) throw new Error("Please enter your email address.");
    const callbackURL = `${location.origin}/${hasOAuthRequest ? `?${query}` : ""}`;
    await api("/api/auth/sign-in/magic-link", { email, callbackURL });
    element("message").textContent = `Magic sign-in link sent to ${email}. Check your inbox!`;
  } catch (error) {
    report(error);
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
  try {
    const email = element("auth-email").value.trim();
    const otp = element("auth-otp").value.trim();
    await api("/api/auth/sign-in/email-otp", { email, otp });
    location.assign(`${location.origin}/${hasOAuthRequest ? `?${query}` : ""}`);
  } catch (error) {
    report(error);
  }
};

element("credentials").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const credentials = {};
    if (element("gde").value.trim()) credentials.gde = { accessToken: element("gde").value.trim() };
    if (element("mvp").value.trim()) {
      credentials.mvp = { accessToken: element("mvp").value.trim(), userProfileId: Number(element("profile").value) };
    }
    await api("/api/connections", credentials, "PUT");
    element("credentials").reset();
    await connections();
    element("message").textContent = "Connections saved.";
  } catch (error) {
    report(error);
  }
};

element("extended-credentials").onsubmit = async (event) => {
  event.preventDefault();
  try {
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
    element("message").textContent = "Analytics and program connections updated.";
  } catch (error) {
    report(error);
  }
};

element("cli-approve-form").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const userCode = element("cli-user-code").value.trim();
    await api("/api/cli/approve", { userCode }, "POST");
    element("message").textContent = "CLI terminal session approved! You can return to your terminal.";
  } catch (error) {
    report(error);
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
