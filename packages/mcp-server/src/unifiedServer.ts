/**
 * @fileoverview Unified DevRel Activity Reporting & Analytics MCP Server
 * @description MCP server supporting Google GDE (Advocu), Microsoft MVP, Content/Analytics APIs
 * (YouTube, Dev.to, Hashnode, GitHub), and additional DevRel / Ambassador programs.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// GDE imports
import type {
  ContentCreationDraft,
  GooglerInteractionDraft,
  MentoringDraft,
  ProductFeedbackDraft,
  PublicSpeakingDraft,
  StoryDraft,
  WorkshopDraft,
} from "./interfaces/index.js";
import {
  ContentType,
  Country,
  EventFormat,
  InteractionFormat,
  InteractionType,
  ProductFeedbackContentType,
  SignificanceType,
} from "./types/index.js";

// MVP imports
import type {
  MVPBlogActivity,
  MVPBookActivity,
  MVPSpeakingActivity,
  MVPVideoActivity,
} from "./interfaces/mvp/index.js";
import { MVPActivityRole, MVPActivityType, MVPTargetAudience } from "./types/mvp/index.js";

export interface ProviderCredentials {
  /** Google Developer Experts (Advocu Personal API) */
  gde?: { accessToken: string; baseUrl?: string };
  /** Microsoft MVP Portal API */
  mvp?: { accessToken: string; userProfileId: number; baseUrl?: string };
  /** YouTube Data API v3 (OAuth access token or API key) */
  youtube?: { accessToken?: string; apiKey?: string; channelId?: string };
  /** Dev.to API key for pulling article views & metrics */
  devto?: { apiKey: string; username?: string };
  /** Hashnode Personal Access Token & publication host */
  hashnode?: { accessToken: string; publicationHost: string };
  /** GitHub OAuth or Personal Access Token for OSS DevRel metrics */
  github?: { accessToken: string; username?: string };
  /** Other DevRel / Ambassador programs (AWS Community Builders, Docker Captains, Cypress, Custom Advocu) */
  programs?: {
    awsCommunity?: { handle: string; webhookUrl?: string };
    dockerCaptains?: { accessToken: string; programSlug?: string };
    cypressAmbassadors?: { accessToken: string; programSlug?: string };
    customAdvocu?: { accessToken: string; programSlug: string; baseUrl?: string };
  };
}

export interface LoggedDevRelActivity {
  id?: string;
  program: string;
  activityType: string;
  title: string;
  description?: string;
  url: string;
  activityDate: string;
  metrics?: Record<string, number | string>;
  status?: string;
  createdAt?: string;
}

export interface ActivityServerOptions {
  credentials: ProviderCredentials;
  readDocumentation: (file: string) => Promise<string>;
  exposeProviderErrors?: boolean;
  onLogActivity?: (activity: LoggedDevRelActivity) => Promise<LoggedDevRelActivity | void>;
  onListActivities?: (filter?: { program?: string; limit?: number }) => Promise<LoggedDevRelActivity[]>;
}

// Define available documentation resources
export const DOCUMENTATION_RESOURCES = [
  {
    uri: "docs://api-reference",
    name: "API Reference",
    description: "Complete API documentation for Microsoft MVP, Google GDE (Advocu), and DevRel analytics APIs",
    mimeType: "text/markdown",
    file: "API.md",
  },
  {
    uri: "docs://mvp-api-reference",
    name: "MVP API Reference",
    description: "Detailed Microsoft MVP API reference with field specifications and examples",
    mimeType: "text/markdown",
    file: "MVP_API_REFERENCE.md",
  },
  {
    uri: "docs://mvp-fixes-changelog",
    name: "MVP Integration Fixes Changelog",
    description: "Complete changelog of fixes applied to MVP integration",
    mimeType: "text/markdown",
    file: "CHANGELOG_MVP_FIXES.md",
  },
  {
    uri: "docs://error-handling",
    name: "Error Handling Improvements",
    description: "Documentation of error handling improvements and best practices",
    mimeType: "text/markdown",
    file: "ERROR_HANDLING_IMPROVEMENTS.md",
  },
  {
    uri: "docs://mcp-resources",
    name: "MCP Resources Guide",
    description: "Guide on how to use MCP resources to access documentation",
    mimeType: "text/markdown",
    file: "MCP_RESOURCES.md",
  },
] as const;

export class UnifiedActivityReportingServer {
  private readonly server: Server;

  // GDE configuration
  private readonly gdeAccessToken: string | null;
  private readonly gdeBaseUrl: string;
  private readonly gdeEnabled: boolean;

  // MVP configuration
  private readonly mvpAccessToken: string | null;
  private readonly mvpUserProfileId: number | null;
  private readonly mvpBaseUrl: string;
  private readonly mvpEnabled: boolean;

  // In-memory fallback activity log for local stdio sessions
  private readonly localActivityLog: LoggedDevRelActivity[] = [];

  private getErrorMessage(error: unknown): string {
    if (this.options.exposeProviderErrors === false) {
      return "Provider request failed. Check your connection settings and try again.";
    }
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    if (error && typeof error === "object") {
      if ("message" in error && typeof error.message === "string") {
        return error.message;
      }
      if ("error" in error && typeof error.error === "string") {
        return error.error;
      }
      if ("statusText" in error && typeof error.statusText === "string") {
        return error.statusText;
      }
    }
    return JSON.stringify(error);
  }

  constructor(private readonly options: ActivityServerOptions) {
    this.server = new Server(
      {
        name: "devrel-mcp-server",
        version: "0.2.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      },
    );

    // Setup GDE
    this.gdeAccessToken = options.credentials.gde?.accessToken || null;
    this.gdeBaseUrl = options.credentials.gde?.baseUrl ?? "https://api.advocu.com/personal-api/v1/gde";
    this.gdeEnabled = !!this.gdeAccessToken;

    // Setup MVP
    this.mvpAccessToken = options.credentials.mvp?.accessToken || null;
    this.mvpUserProfileId = options.credentials.mvp?.userProfileId ?? null;
    this.mvpBaseUrl = options.credentials.mvp?.baseUrl ?? "https://mavenapi-prod.azurewebsites.net/api";
    this.mvpEnabled = !!(this.mvpAccessToken && this.mvpUserProfileId);

    this.setupToolHandlers();
    this.setupResourceHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Array<{
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
      }> = [];

      // 1. Google GDE Tools (All 7 Advocu endpoints)
      if (this.gdeEnabled) {
        tools.push(
          {
            name: "submit_gde_content_creation",
            description: "Submit a content creation activity draft to Google GDE program (Advocu)",
            inputSchema: {
              type: "object",
              properties: {
                title: { type: "string", minLength: 3, maxLength: 200 },
                description: { type: "string", maxLength: 2000 },
                activityDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                contentType: { type: "string", enum: Object.values(ContentType) },
                tags: { type: "array", items: { type: "string" }, minItems: 0 },
                metrics: {
                  type: "object",
                  properties: { readers: { type: "integer", minimum: 1 } },
                  required: ["readers"],
                },
                activityUrl: { type: "string", maxLength: 500, pattern: "^https?://.*" },
                additionalInfo: { type: "string", maxLength: 2000 },
                private: { type: "boolean" },
              },
              required: ["title", "description", "activityDate", "contentType", "metrics", "activityUrl"],
            },
          },
          {
            name: "submit_gde_public_speaking",
            description: "Submit a public speaking activity draft to Google GDE program (Advocu)",
            inputSchema: {
              type: "object",
              properties: {
                title: { type: "string", minLength: 3, maxLength: 200 },
                description: { type: "string", maxLength: 2000 },
                activityDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                tags: { type: "array", items: { type: "string" }, minItems: 0 },
                metrics: {
                  type: "object",
                  properties: { attendees: { type: "integer", minimum: 1 } },
                  required: ["attendees"],
                },
                eventFormat: { type: "string", enum: Object.values(EventFormat) },
                country: { type: "string", enum: Object.values(Country) },
                inPersonAttendees: { type: "integer", minimum: 0 },
                activityUrl: { type: "string", maxLength: 500, pattern: "^https?://.*" },
                additionalInfo: { type: "string", maxLength: 2000 },
                private: { type: "boolean" },
              },
              required: ["title", "description", "activityDate", "metrics", "eventFormat", "activityUrl"],
            },
          },
          {
            name: "submit_gde_workshop",
            description: "Submit a workshop activity draft to Google GDE program (Advocu)",
            inputSchema: {
              type: "object",
              properties: {
                title: { type: "string", minLength: 3, maxLength: 200 },
                description: { type: "string", maxLength: 2000 },
                activityDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                tags: { type: "array", items: { type: "string" }, minItems: 0 },
                metrics: {
                  type: "object",
                  properties: { attendees: { type: "integer", minimum: 1 } },
                  required: ["attendees"],
                },
                eventFormat: { type: "string", enum: Object.values(EventFormat) },
                country: { type: "string", enum: Object.values(Country) },
                inPersonAttendees: { type: "integer", minimum: 0 },
                activityUrl: { type: "string", maxLength: 500, pattern: "^https?://.*" },
                additionalInfo: { type: "string", maxLength: 2000 },
                private: { type: "boolean" },
              },
              required: ["title", "description", "activityDate", "metrics", "eventFormat", "activityUrl"],
            },
          },
          {
            name: "submit_gde_mentoring",
            description: "Submit a mentoring activity draft to Google GDE program (Advocu)",
            inputSchema: {
              type: "object",
              properties: {
                title: { type: "string", minLength: 3, maxLength: 200 },
                description: { type: "string", maxLength: 2000 },
                activityDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                tags: { type: "array", items: { type: "string" }, minItems: 0 },
                metrics: {
                  type: "object",
                  properties: { attendees: { type: "integer", minimum: 1 } },
                  required: ["attendees"],
                },
                eventFormat: { type: "string", enum: Object.values(EventFormat) },
                country: { type: "string", enum: Object.values(Country) },
                inPersonAttendees: { type: "integer", minimum: 0 },
                activityUrl: { type: "string", maxLength: 500, pattern: "^https?://.*" },
                additionalInfo: { type: "string", maxLength: 2000 },
                private: { type: "boolean" },
              },
              required: ["title", "description", "activityDate", "metrics", "eventFormat", "activityUrl"],
            },
          },
          {
            name: "submit_gde_product_feedback",
            description: "Submit a product feedback activity draft to Google GDE program (Advocu)",
            inputSchema: {
              type: "object",
              properties: {
                title: { type: "string", minLength: 3, maxLength: 200 },
                description: { type: "string", maxLength: 2000 },
                activityDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                contentType: { type: "string", enum: Object.values(ProductFeedbackContentType) },
                productDescription: { type: "string", maxLength: 500 },
                tags: { type: "array", items: { type: "string" }, minItems: 0 },
                metrics: {
                  type: "object",
                  properties: { timeSpent: { type: "integer", minimum: 1 } },
                  required: ["timeSpent"],
                },
                additionalInfo: { type: "string", maxLength: 2000 },
                private: { type: "boolean" },
              },
              required: ["title", "description", "activityDate", "contentType", "productDescription", "metrics"],
            },
          },
          {
            name: "submit_gde_googler_interaction",
            description: "Submit a Googler interaction activity draft to Google GDE program (Advocu)",
            inputSchema: {
              type: "object",
              properties: {
                title: { type: "string", minLength: 3, maxLength: 200 },
                description: { type: "string", maxLength: 2000 },
                activityDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                format: { type: "string", enum: Object.values(InteractionFormat) },
                interactionType: { type: "string", enum: Object.values(InteractionType) },
                tags: { type: "array", items: { type: "string" }, minItems: 0 },
                metrics: {
                  type: "object",
                  properties: { timeSpent: { type: "integer", minimum: 1 } },
                  required: ["timeSpent"],
                },
                additionalInfo: { type: "string", maxLength: 2000 },
                additionalLinks: { type: "string", maxLength: 2000 },
                private: { type: "boolean" },
              },
              required: ["title", "description", "activityDate", "format", "interactionType", "metrics"],
            },
          },
          {
            name: "submit_gde_story",
            description: "Submit a success story activity draft to Google GDE program (Advocu)",
            inputSchema: {
              type: "object",
              properties: {
                title: { type: "string", minLength: 3, maxLength: 200 },
                description: { type: "string", maxLength: 2000 },
                activityDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                whyIsSignificant: { type: "string", maxLength: 2000 },
                significanceType: { type: "string", enum: Object.values(SignificanceType) },
                activityUrl: { type: "string", maxLength: 500, pattern: "^https?://.*" },
                tags: { type: "array", items: { type: "string" }, minItems: 0 },
                metrics: {
                  type: "object",
                  properties: { impact: { type: "integer", minimum: 1 } },
                  required: ["impact"],
                },
                additionalInfo: { type: "string", maxLength: 2000 },
                private: { type: "boolean" },
              },
              required: [
                "title",
                "description",
                "activityDate",
                "whyIsSignificant",
                "significanceType",
                "activityUrl",
                "metrics",
              ],
            },
          },
        );
      }

      // 2. Documentation Tools (always available)
      tools.push(
        {
          name: "list_documentation",
          description: "List all available documentation resources",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "get_documentation",
          description: "Get a specific documentation file by name",
          inputSchema: {
            type: "object",
            properties: {
              documentName: {
                type: "string",
                enum: [
                  "api-reference",
                  "mvp-api-reference",
                  "mvp-fixes-changelog",
                  "error-handling",
                  "mcp-resources",
                ],
                description: "Name of the documentation to retrieve",
              },
            },
            required: ["documentName"],
          },
        },
      );

      // 3. Microsoft MVP Tools (Video, Blog, Speaking, Book)
      if (this.mvpEnabled) {
        tools.push(
          {
            name: "submit_mvp_video",
            description: "Submit a video activity to Microsoft MVP. Valid roles for videos: Host, Presenter, Speaker.",
            inputSchema: {
              type: "object",
              properties: {
                title: { type: "string", minLength: 1, maxLength: 100 },
                description: { type: "string", maxLength: 1000 },
                date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                url: { type: "string", pattern: "^https?://.*" },
                targetAudience: {
                  type: "array",
                  items: { type: "string", enum: Object.values(MVPTargetAudience) },
                  minItems: 1,
                },
                role: {
                  type: "string",
                  enum: ["Host", "Presenter", "Speaker"],
                  description: "Valid roles for video activities",
                },
                technologyFocusArea: {
                  type: "string",
                  description: "Main technology area (e.g., 'Web Development', 'Cloud & AI')",
                },
                liveStreamViews: { type: "integer", minimum: 0 },
                onDemandViews: { type: "integer", minimum: 0 },
                numberOfSessions: { type: "integer", minimum: 1, default: 1 },
                isPrivate: { type: "boolean", default: false },
              },
              required: [
                "title",
                "description",
                "date",
                "url",
                "targetAudience",
                "role",
                "technologyFocusArea",
                "liveStreamViews",
                "onDemandViews",
              ],
            },
          },
          {
            name: "submit_mvp_blog",
            description: "Submit a blog post activity to Microsoft MVP",
            inputSchema: {
              type: "object",
              properties: {
                title: { type: "string", minLength: 1, maxLength: 100 },
                description: { type: "string", maxLength: 1000 },
                date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                url: { type: "string", pattern: "^https?://.*" },
                targetAudience: {
                  type: "array",
                  items: { type: "string", enum: Object.values(MVPTargetAudience) },
                  minItems: 1,
                },
                role: { type: "string", enum: Object.values(MVPActivityRole) },
                technologyFocusArea: { type: "string" },
                additionalTechnologyAreas: { type: "array", items: { type: "string" } },
                numberOfViews: { type: "integer", minimum: 0 },
                subscriberBase: { type: "integer", minimum: 0 },
                isPrivate: { type: "boolean", default: false },
              },
              required: [
                "title",
                "description",
                "date",
                "url",
                "targetAudience",
                "role",
                "technologyFocusArea",
                "numberOfViews",
              ],
            },
          },
          {
            name: "submit_mvp_speaking",
            description: "Submit a speaking/conference activity to Microsoft MVP",
            inputSchema: {
              type: "object",
              properties: {
                title: { type: "string", minLength: 1, maxLength: 100 },
                description: { type: "string", maxLength: 1000 },
                date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                url: { type: "string", pattern: "^https?://.*" },
                targetAudience: {
                  type: "array",
                  items: { type: "string", enum: Object.values(MVPTargetAudience) },
                  minItems: 1,
                },
                role: { type: "string", enum: Object.values(MVPActivityRole) },
                technologyFocusArea: { type: "string" },
                additionalTechnologyAreas: { type: "array", items: { type: "string" } },
                inPersonAttendees: { type: "integer", minimum: 0 },
                numberOfSessions: { type: "integer", minimum: 1, default: 1 },
                liveStreamViews: { type: "integer", minimum: 0 },
                onDemandViews: { type: "integer", minimum: 0 },
                isPrivate: { type: "boolean", default: false },
              },
              required: [
                "title",
                "description",
                "date",
                "url",
                "targetAudience",
                "role",
                "technologyFocusArea",
                "inPersonAttendees",
                "numberOfSessions",
              ],
            },
          },
          {
            name: "submit_mvp_book",
            description: "Submit a book or e-book activity to Microsoft MVP",
            inputSchema: {
              type: "object",
              properties: {
                title: { type: "string", minLength: 1, maxLength: 100 },
                description: { type: "string", maxLength: 1000 },
                date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                url: { type: "string", pattern: "^https?://.*" },
                targetAudience: {
                  type: "array",
                  items: { type: "string", enum: Object.values(MVPTargetAudience) },
                  minItems: 1,
                },
                role: { type: "string", enum: Object.values(MVPActivityRole) },
                technologyFocusArea: { type: "string" },
                copiesSold: { type: "integer", minimum: 0 },
                subscriberBase: { type: "integer", minimum: 0 },
                isPrivate: { type: "boolean", default: false },
              },
              required: [
                "title",
                "description",
                "date",
                "url",
                "targetAudience",
                "role",
                "technologyFocusArea",
              ],
            },
          },
        );
      }

      // 4. Content & Analytics Auto-Fetch Tools (enabled when credentials are provided)
      if (this.options.credentials.youtube?.apiKey || this.options.credentials.youtube?.accessToken) {
        tools.push({
          name: "fetch_youtube_video_stats",
          description:
            "Fetch YouTube video title, publish date, views, likes, and description to auto-populate GDE or MVP activity submissions",
          inputSchema: {
            type: "object",
            properties: {
              videoIdOrUrl: {
                type: "string",
                description: "YouTube video URL or 11-character video ID",
              },
            },
            required: ["videoIdOrUrl"],
          },
        });
      }

      if (this.options.credentials.devto?.apiKey) {
        tools.push({
          name: "fetch_devto_articles",
          description: "Fetch your recent Dev.to articles with page view counts and URLs for DevRel reporting",
          inputSchema: {
            type: "object",
            properties: {
              perPage: { type: "integer", minimum: 1, maximum: 50, default: 10 },
            },
          },
        });
      }

      if (this.options.credentials.hashnode?.accessToken && this.options.credentials.hashnode?.publicationHost) {
        tools.push({
          name: "fetch_hashnode_posts",
          description: "Fetch your recent Hashnode blog posts with view counts and URLs for DevRel reporting",
          inputSchema: {
            type: "object",
            properties: {
              first: { type: "integer", minimum: 1, maximum: 20, default: 10 },
            },
          },
        });
      }

      if (this.options.credentials.github?.accessToken) {
        tools.push({
          name: "fetch_github_activity",
          description: "Fetch repository statistics or recent pull requests/releases from GitHub for OSS DevRel reporting",
          inputSchema: {
            type: "object",
            properties: {
              repo: {
                type: "string",
                description: "Optional owner/repo (e.g. 'CodingCatDev/devrel-mcp') to inspect specific repository metrics",
              },
            },
          },
        });
      }

      // 5. Additional DevRel & Ambassador Programs (AWS Community, Docker Captains, Cypress, Custom Advocu)
      const programs = this.options.credentials.programs;
      const hasAdvocuProgram = !!(
        programs?.dockerCaptains?.accessToken ||
        programs?.cypressAmbassadors?.accessToken ||
        programs?.customAdvocu?.accessToken
      );
      if (hasAdvocuProgram) {
        tools.push({
          name: "submit_ambassador_advocu_draft",
          description:
            "Submit an activity draft to another Advocu-powered ambassador program (Docker Captains, Cypress Ambassadors, or custom Advocu program)",
          inputSchema: {
            type: "object",
            properties: {
              program: {
                type: "string",
                enum: ["dockerCaptains", "cypressAmbassadors", "customAdvocu"],
              },
              activityType: {
                type: "string",
                enum: ["content-creation", "public-speaking", "workshop", "mentoring"],
              },
              payload: {
                type: "object",
                description: "Advocu activity draft payload matching the selected activityType",
              },
            },
            required: ["program", "activityType", "payload"],
          },
        });
      }

      if (
        programs?.awsCommunity?.handle ||
        hasAdvocuProgram ||
        this.options.onLogActivity ||
        this.options.onListActivities
      ) {
        tools.push(
          {
            name: "log_devrel_activity",
            description:
              "Record a DevRel activity in your unified activity ledger (supports AWS Community Builders, Docker Captains, CNCF, GDE, MVP, and custom programs)",
            inputSchema: {
              type: "object",
              properties: {
                program: {
                  type: "string",
                  description: "Program name (e.g. 'aws-community-builders', 'docker-captains', 'gde', 'mvp', 'cncf')",
                },
                activityType: {
                  type: "string",
                  description: "Type of activity (e.g. 'blog', 'video', 'speaking', 'workshop', 'oss')",
                },
                title: { type: "string", minLength: 2, maxLength: 200 },
                description: { type: "string", maxLength: 2000 },
                url: { type: "string", pattern: "^https?://.*" },
                activityDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                metrics: {
                  type: "object",
                  description: "Key metrics such as views, attendees, readers, or stars",
                },
              },
              required: ["program", "activityType", "title", "url", "activityDate"],
            },
          },
          {
            name: "list_devrel_activities",
            description: "List logged DevRel activities across all connected programs",
            inputSchema: {
              type: "object",
              properties: {
                program: { type: "string", description: "Optional program filter" },
                limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
              },
            },
          },
        );
      }

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Documentation tools
        if (name === "list_documentation") {
          return await this.listDocumentation();
        }
        if (name === "get_documentation") {
          return await this.getDocumentation(args as { documentName: string });
        }

        // MVP tools
        if (name.startsWith("submit_mvp_")) {
          if (!this.mvpEnabled) {
            throw new McpError(ErrorCode.InvalidRequest, "MVP tools are not enabled. Please configure MVP credentials.");
          }
          switch (name) {
            case "submit_mvp_video":
              return await this.submitMVPVideoActivity(args as unknown as MVPVideoActivity);
            case "submit_mvp_blog":
              return await this.submitMVPBlogActivity(args as unknown as MVPBlogActivity);
            case "submit_mvp_speaking":
              return await this.submitMVPSpeakingActivity(args as unknown as MVPSpeakingActivity);
            case "submit_mvp_book":
              return await this.submitMVPBookActivity(args as unknown as MVPBookActivity);
          }
        }

        // GDE tools
        if (name.startsWith("submit_gde_")) {
          if (!this.gdeEnabled) {
            throw new McpError(ErrorCode.InvalidRequest, "GDE tools are not enabled. Please configure GDE credentials.");
          }
          switch (name) {
            case "submit_gde_content_creation":
              return await this.submitGDEActivityDraft("content-creation", args as unknown as ContentCreationDraft);
            case "submit_gde_public_speaking":
              return await this.submitGDEActivityDraft("public-speaking", args as unknown as PublicSpeakingDraft);
            case "submit_gde_workshop":
              return await this.submitGDEActivityDraft("workshop", args as unknown as WorkshopDraft);
            case "submit_gde_mentoring":
              return await this.submitGDEActivityDraft("mentoring", args as unknown as MentoringDraft);
            case "submit_gde_product_feedback":
              return await this.submitGDEActivityDraft(
                "product-feedback-given",
                args as unknown as ProductFeedbackDraft,
              );
            case "submit_gde_googler_interaction":
              return await this.submitGDEActivityDraft(
                "interaction-with-googlers",
                args as unknown as GooglerInteractionDraft,
              );
            case "submit_gde_story":
              return await this.submitGDEActivityDraft("stories", args as unknown as StoryDraft);
          }
        }

        // Content & Analytics tools
        if (name === "fetch_youtube_video_stats") {
          return await this.fetchYouTubeVideoStats(args as { videoIdOrUrl: string });
        }
        if (name === "fetch_devto_articles") {
          return await this.fetchDevToArticles(args as { perPage?: number });
        }
        if (name === "fetch_hashnode_posts") {
          return await this.fetchHashnodePosts(args as { first?: number });
        }
        if (name === "fetch_github_activity") {
          return await this.fetchGitHubActivity(args as { repo?: string });
        }

        // Additional Ambassador / Cross-Program tools
        if (name === "submit_ambassador_advocu_draft") {
          return await this.submitAmbassadorAdvocuDraft(
            args as {
              program: "dockerCaptains" | "cypressAmbassadors" | "customAdvocu";
              activityType: string;
              payload: Record<string, unknown>;
            },
          );
        }
        if (name === "log_devrel_activity") {
          return await this.logDevRelActivity(args as unknown as LoggedDevRelActivity);
        }
        if (name === "list_devrel_activities") {
          return await this.listDevRelActivities(args as { program?: string; limit?: number });
        }

        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        const errorMsg = this.getErrorMessage(error);
        throw new McpError(ErrorCode.InternalError, `Failed to execute tool '${name}': ${errorMsg}`);
      }
    });
  }

  private setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: DOCUMENTATION_RESOURCES.map((doc) => ({
          uri: doc.uri,
          name: doc.name,
          description: doc.description,
          mimeType: doc.mimeType,
        })),
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      const resource = DOCUMENTATION_RESOURCES.find((doc) => doc.uri === uri);

      if (!resource) {
        throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
      }

      try {
        const content = await this.options.readDocumentation(resource.file);
        return {
          contents: [
            {
              uri: resource.uri,
              mimeType: resource.mimeType,
              text: content,
            },
          ],
        };
      } catch (error) {
        const errorMsg = this.getErrorMessage(error);
        throw new McpError(ErrorCode.InternalError, `Failed to read resource '${resource.name}': ${errorMsg}`);
      }
    });
  }

  private async listDocumentation() {
    const docsList = DOCUMENTATION_RESOURCES.map((doc) => ({
      name: doc.uri.replace("docs://", ""),
      title: doc.name,
      description: doc.description,
    }));

    return {
      content: [
        {
          type: "text",
          text: `📚 Available Documentation:\n\n${docsList
            .map((doc, i) => `${i + 1}. **${doc.title}** (${doc.name})\n   ${doc.description}`)
            .join("\n\n")}`,
        },
      ],
    };
  }

  private async getDocumentation(args: { documentName: string }) {
    const { documentName } = args;
    const uri = `docs://${documentName}`;
    const resource = DOCUMENTATION_RESOURCES.find((doc) => doc.uri === uri);

    if (!resource) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Documentation not found: ${documentName}\n\nAvailable docs: ${DOCUMENTATION_RESOURCES.map((d) => d.uri.replace("docs://", "")).join(", ")}`,
          },
        ],
      };
    }

    try {
      const content = await this.options.readDocumentation(resource.file);
      return {
        content: [
          {
            type: "text",
            text: `# ${resource.name}\n\n${content}`,
          },
        ],
      };
    } catch (error) {
      const errorMsg = this.getErrorMessage(error);
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to read ${resource.name}: ${errorMsg}`,
          },
        ],
      };
    }
  }

  // MVP Methods
  private async submitMVPVideoActivity(data: Partial<MVPVideoActivity>) {
    const activity: MVPVideoActivity = {
      id: 0,
      activityTypeName: MVPActivityType.VIDEO,
      typeName: "Video",
      date: new Date(data.date!).toISOString(),
      description: data.description!,
      isPrivate: data.isPrivate ?? false,
      targetAudience: data.targetAudience!,
      tenant: "MVP",
      title: data.title!,
      url: data.url!,
      userProfileId: this.mvpUserProfileId!,
      role: data.role!,
      technologyFocusArea: data.technologyFocusArea!,
      additionalTechnologyAreas: [],
      liveStreamViews: data.liveStreamViews!,
      onDemandViews: data.onDemandViews!,
      numberOfSessions: data.numberOfSessions ?? 1,
      inPersonAttendees: 0,
      subscriberBase: 0,
      imageUrl: "",
    };

    return await this.submitMVPActivity(activity);
  }

  private async submitMVPBlogActivity(data: Partial<MVPBlogActivity>) {
    const activity: MVPBlogActivity = {
      id: 0,
      activityTypeName: MVPActivityType.BLOG,
      typeName: "Blog",
      date: new Date(data.date!).toISOString(),
      description: data.description!,
      isPrivate: data.isPrivate ?? false,
      targetAudience: data.targetAudience!,
      tenant: "MVP",
      title: data.title!,
      url: data.url!,
      userProfileId: this.mvpUserProfileId!,
      role: data.role!,
      technologyFocusArea: data.technologyFocusArea!,
      additionalTechnologyAreas: data.additionalTechnologyAreas,
      numberOfViews: data.numberOfViews!,
      subscriberBase: data.subscriberBase ?? 0,
      imageUrl: "",
    };

    return await this.submitMVPActivity(activity);
  }

  private async submitMVPSpeakingActivity(data: Partial<MVPSpeakingActivity>) {
    const activity: MVPSpeakingActivity = {
      id: 0,
      activityTypeName: MVPActivityType.SPEAKING_CONFERENCE,
      typeName: "Speaking",
      date: new Date(data.date!).toISOString(),
      description: data.description!,
      isPrivate: data.isPrivate ?? false,
      targetAudience: data.targetAudience!,
      tenant: "MVP",
      title: data.title!,
      url: data.url!,
      userProfileId: this.mvpUserProfileId!,
      role: data.role!,
      technologyFocusArea: data.technologyFocusArea!,
      additionalTechnologyAreas: data.additionalTechnologyAreas,
      inPersonAttendees: data.inPersonAttendees!,
      numberOfSessions: data.numberOfSessions ?? 1,
      liveStreamViews: data.liveStreamViews ?? 0,
      onDemandViews: data.onDemandViews ?? 0,
      imageUrl: "",
    };

    return await this.submitMVPActivity(activity);
  }

  private async submitMVPBookActivity(data: Partial<MVPBookActivity>) {
    const activity: MVPBookActivity = {
      id: 0,
      activityTypeName: MVPActivityType.BOOK_EBOOK,
      typeName: "Book/E-book",
      date: new Date(data.date!).toISOString(),
      description: data.description!,
      isPrivate: data.isPrivate ?? false,
      targetAudience: data.targetAudience!,
      tenant: "MVP",
      title: data.title!,
      url: data.url!,
      userProfileId: this.mvpUserProfileId!,
      role: data.role!,
      technologyFocusArea: data.technologyFocusArea!,
      copiesSold: data.copiesSold ?? 0,
      subscriberBase: data.subscriberBase ?? 0,
      imageUrl: "",
    };

    return await this.submitMVPActivity(activity);
  }

  private async submitMVPActivity(
    activity: MVPVideoActivity | MVPBlogActivity | MVPSpeakingActivity | MVPBookActivity,
  ) {
    const url = `${this.mvpBaseUrl}/Activities/`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.mvpAccessToken}`,
        },
        body: JSON.stringify({ activity }),
      });

      if (!response.ok) {
        const errorText =
          this.options.exposeProviderErrors === false
            ? "Check the submitted fields and your provider connection."
            : await response.text();
        let errorMessage = `MVP API error (${response.status})`;

        if (response.status === 401) {
          errorMessage =
            "❌ MVP authentication failed. Your MVP_ACCESS_TOKEN may be expired or invalid.\n\nUpdate your MVP token in the DevRel MCP dashboard or via `npx @codingcatdev/devrel-mcp sync-mvp`.";
        } else if (response.status === 400) {
          errorMessage = `❌ MVP API rejected the request:\n\n${errorText}\n\nPlease check:\n- Activity type is correct for the data provided\n- Role is valid for this activity type\n- All required fields are present\n- Date format is correct (YYYY-MM-DD)`;
        } else if (response.status === 429) {
          errorMessage = "⏱️ MVP API rate limit exceeded. Please wait a moment and try again.";
        } else {
          errorMessage = `❌ MVP API error (${response.status}):\n\n${errorText}`;
        }

        return {
          content: [{ type: "text", text: errorMessage }],
        };
      }

      const result = (await response.json()) as Record<string, unknown>;

      if (this.options.onLogActivity) {
        await this.options.onLogActivity({
          program: "mvp",
          activityType: activity.activityTypeName,
          title: activity.title,
          description: activity.description,
          url: activity.url,
          activityDate: activity.date.slice(0, 10),
          status: "submitted",
        });
      }

      return {
        content: [
          {
            type: "text",
            text: `✅ MVP Activity submitted!\n\nType: ${activity.activityTypeName}\nTitle: ${activity.title}\n\nResponse: ${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      const errorMsg = this.getErrorMessage(error);
      throw new McpError(
        ErrorCode.InternalError,
        `❌ Failed to submit MVP activity:\n\n${errorMsg}\n\nActivity type: ${activity.activityTypeName}\nTitle: ${activity.title}`,
      );
    }
  }

  // GDE Methods
  private async submitGDEActivityDraft(
    endpoint: string,
    data:
      | ContentCreationDraft
      | PublicSpeakingDraft
      | WorkshopDraft
      | MentoringDraft
      | ProductFeedbackDraft
      | GooglerInteractionDraft
      | StoryDraft,
  ) {
    const url = `${this.gdeBaseUrl}/activity-drafts/${endpoint}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.gdeAccessToken}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorText =
          this.options.exposeProviderErrors === false
            ? "Check the submitted fields and your provider connection."
            : await response.text();
        let errorMessage = `GDE API error (${response.status})`;

        if (response.status === 401) {
          errorMessage =
            "❌ GDE authentication failed. Your ADVOCU_ACCESS_TOKEN may be expired or invalid.\n\nPlease check your Advocu access token configuration.";
        } else if (response.status === 400) {
          errorMessage = `❌ GDE API rejected the request:\n\n${errorText}\n\nPlease check:\n- All required fields are present\n- Field values match expected formats\n- Tags are valid\n- Date format is correct (YYYY-MM-DD)`;
        } else if (response.status === 429) {
          errorMessage = "⏱️ GDE API rate limit exceeded (30 requests/minute). Please wait and try again.";
        } else {
          errorMessage = `❌ GDE API error (${response.status}):\n\n${errorText}`;
        }

        return {
          content: [{ type: "text", text: errorMessage }],
        };
      }

      const result = (await response.json()) as Record<string, unknown>;

      if (this.options.onLogActivity) {
        await this.options.onLogActivity({
          program: "gde",
          activityType: endpoint,
          title: data.title,
          description: data.description,
          url: "activityUrl" in data && typeof data.activityUrl === "string" ? data.activityUrl : "https://advocu.com",
          activityDate: data.activityDate,
          status: "submitted",
        });
      }

      return {
        content: [
          {
            type: "text",
            text: `✅ GDE Activity submitted!\n\nEndpoint: ${endpoint}\n\nResponse: ${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      const errorMsg = this.getErrorMessage(error);
      throw new McpError(ErrorCode.InternalError, `❌ Failed to submit GDE activity:\n\n${errorMsg}\n\nEndpoint: ${endpoint}`);
    }
  }

  // Content & Analytics Methods
  private extractYouTubeId(input: string): string {
    const trimmed = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    try {
      const parsed = new URL(trimmed);
      if (parsed.hostname.includes("youtu.be")) {
        return parsed.pathname.slice(1, 12);
      }
      const v = parsed.searchParams.get("v");
      if (v) return v;
    } catch {
      // Fallback
    }
    throw new McpError(ErrorCode.InvalidParams, "Invalid YouTube video ID or URL");
  }

  private async fetchYouTubeVideoStats(args: { videoIdOrUrl: string }) {
    const yt = this.options.credentials.youtube;
    if (!yt?.apiKey && !yt?.accessToken) {
      throw new McpError(ErrorCode.InvalidRequest, "YouTube credentials are not configured.");
    }
    const videoId = this.extractYouTubeId(args.videoIdOrUrl);
    const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
    endpoint.searchParams.set("part", "snippet,statistics");
    endpoint.searchParams.set("id", videoId);
    if (yt.apiKey) endpoint.searchParams.set("key", yt.apiKey);

    const headers: Record<string, string> = { Accept: "application/json" };
    if (yt.accessToken) headers.Authorization = `Bearer ${yt.accessToken}`;

    const response = await fetch(endpoint.toString(), { headers });
    if (!response.ok) {
      return {
        content: [{ type: "text", text: `❌ YouTube API error (${response.status}). Check your YouTube credentials.` }],
      };
    }
    const data = (await response.json()) as {
      items?: Array<{
        id: string;
        snippet?: { title?: string; description?: string; publishedAt?: string };
        statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
      }>;
    };
    const item = data.items?.[0];
    if (!item) {
      return { content: [{ type: "text", text: `❌ No YouTube video found for ID: ${videoId}` }] };
    }
    const summary = {
      videoId: item.id,
      url: `https://www.youtube.com/watch?v=${item.id}`,
      title: item.snippet?.title ?? "",
      publishedDate: item.snippet?.publishedAt?.slice(0, 10) ?? "",
      views: Number(item.statistics?.viewCount ?? 0),
      likes: Number(item.statistics?.likeCount ?? 0),
      comments: Number(item.statistics?.commentCount ?? 0),
      description: item.snippet?.description ?? "",
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
    };
  }

  private async fetchDevToArticles(args?: { perPage?: number }) {
    const devto = this.options.credentials.devto;
    if (!devto?.apiKey) {
      throw new McpError(ErrorCode.InvalidRequest, "Dev.to credentials are not configured.");
    }
    const perPage = Math.min(Math.max(args?.perPage ?? 10, 1), 50);
    const response = await fetch(`https://dev.to/api/articles/me?per_page=${perPage}`, {
      headers: {
        "api-key": devto.apiKey,
        Accept: "application/json",
        "User-Agent": "CodingCatDev-DevRel-MCP/0.2.0",
      },
    });
    if (!response.ok) {
      return {
        content: [{ type: "text", text: `❌ Dev.to API error (${response.status}). Check your Dev.to API key.` }],
      };
    }
    const articles = (await response.json()) as Array<{
      id: number;
      title: string;
      description: string;
      published_at: string;
      url: string;
      page_views_count: number;
      public_reactions_count: number;
      tag_list: string[];
    }>;
    const formatted = articles.map((a) => ({
      title: a.title,
      description: a.description,
      date: a.published_at?.slice(0, 10),
      url: a.url,
      views: a.page_views_count ?? 0,
      reactions: a.public_reactions_count ?? 0,
      tags: a.tag_list ?? [],
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }],
    };
  }

  private async fetchHashnodePosts(args?: { first?: number }) {
    const hashnode = this.options.credentials.hashnode;
    if (!hashnode?.accessToken || !hashnode?.publicationHost) {
      throw new McpError(ErrorCode.InvalidRequest, "Hashnode credentials are not configured.");
    }
    const first = Math.min(Math.max(args?.first ?? 10, 1), 20);
    const query = `
      query PublicationPosts($host: String!, $first: Int!) {
        publication(host: $host) {
          posts(first: $first) {
            edges {
              node {
                title
                brief
                url
                publishedAt
                views
              }
            }
          }
        }
      }
    `;
    const response = await fetch("https://gql.hashnode.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: hashnode.accessToken,
      },
      body: JSON.stringify({ query, variables: { host: hashnode.publicationHost, first } }),
    });
    if (!response.ok) {
      return {
        content: [{ type: "text", text: `❌ Hashnode API error (${response.status}).` }],
      };
    }
    const result = (await response.json()) as Record<string, unknown>;
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  private async fetchGitHubActivity(args?: { repo?: string }) {
    const gh = this.options.credentials.github;
    if (!gh?.accessToken) {
      throw new McpError(ErrorCode.InvalidRequest, "GitHub credentials are not configured.");
    }
    const headers = {
      Authorization: `Bearer ${gh.accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "CodingCatDev-DevRel-MCP/0.2.0",
    };
    const url = args?.repo
      ? `https://api.github.com/repos/${args.repo}`
      : "https://api.github.com/user/repos?sort=updated&per_page=10";
    const response = await fetch(url, { headers });
    if (!response.ok) {
      return {
        content: [{ type: "text", text: `❌ GitHub API error (${response.status}).` }],
      };
    }
    const data = await response.json();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private async submitAmbassadorAdvocuDraft(args: {
    program: "dockerCaptains" | "cypressAmbassadors" | "customAdvocu";
    activityType: string;
    payload: Record<string, unknown>;
  }) {
    const programs = this.options.credentials.programs;
    let token: string | undefined;
    let slug: string | undefined;
    let baseUrl = "https://api.advocu.com/personal-api/v1";

    if (args.program === "dockerCaptains" && programs?.dockerCaptains?.accessToken) {
      token = programs.dockerCaptains.accessToken;
      slug = programs.dockerCaptains.programSlug || "docker-captains";
    } else if (args.program === "cypressAmbassadors" && programs?.cypressAmbassadors?.accessToken) {
      token = programs.cypressAmbassadors.accessToken;
      slug = programs.cypressAmbassadors.programSlug || "cypress";
    } else if (args.program === "customAdvocu" && programs?.customAdvocu?.accessToken) {
      token = programs.customAdvocu.accessToken;
      slug = programs.customAdvocu.programSlug;
      if (programs.customAdvocu.baseUrl) baseUrl = programs.customAdvocu.baseUrl;
    }

    if (!token || !slug) {
      throw new McpError(ErrorCode.InvalidRequest, `Credentials for ${args.program} are not configured.`);
    }

    const response = await fetch(`${baseUrl}/${slug}/activity-drafts/${args.activityType}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(args.payload),
    });

    if (!response.ok) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Advocu (${slug}) error (${response.status}). Check your payload and token.`,
          },
        ],
      };
    }

    const result = await response.json();
    return {
      content: [
        {
          type: "text",
          text: `✅ Submitted to ${slug} (${args.activityType})!\n\nResponse: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  }

  private async logDevRelActivity(activity: LoggedDevRelActivity) {
    const entry: LoggedDevRelActivity = {
      ...activity,
      status: activity.status || "logged",
      createdAt: new Date().toISOString(),
    };
    if (this.options.onLogActivity) {
      const saved = await this.options.onLogActivity(entry);
      return {
        content: [
          {
            type: "text",
            text: `✅ Logged DevRel activity for ${entry.program}: ${entry.title}\n\n${JSON.stringify(saved || entry, null, 2)}`,
          },
        ],
      };
    }
    this.localActivityLog.unshift(entry);
    return {
      content: [
        {
          type: "text",
          text: `✅ Logged DevRel activity for ${entry.program}: ${entry.title}\n\n${JSON.stringify(entry, null, 2)}`,
        },
      ],
    };
  }

  private async listDevRelActivities(filter?: { program?: string; limit?: number }) {
    const activities = this.options.onListActivities
      ? await this.options.onListActivities(filter)
      : this.localActivityLog
          .filter((a) => !filter?.program || a.program === filter.program)
          .slice(0, filter?.limit ?? 20);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(activities, null, 2),
        },
      ],
    };
  }

  async connect(transport: Transport) {
    await this.server.connect(transport);
  }

  async close() {
    await this.server.close();
  }
}

export { UnifiedActivityReportingServer as DevRelActivityReportingServer };
