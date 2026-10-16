import api from "../../../../packages/mcp-server/docs/API.md";
import fixes from "../../../../packages/mcp-server/docs/CHANGELOG_MVP_FIXES.md";
import errors from "../../../../packages/mcp-server/docs/ERROR_HANDLING_IMPROVEMENTS.md";
import resources from "../../../../packages/mcp-server/docs/MCP_RESOURCES.md";
import mvp from "../../../../packages/mcp-server/docs/MVP_API_REFERENCE.md";

const documents: Record<string, string> = {
  "API.md": api,
  "MVP_API_REFERENCE.md": mvp,
  "CHANGELOG_MVP_FIXES.md": fixes,
  "ERROR_HANDLING_IMPROVEMENTS.md": errors,
  "MCP_RESOURCES.md": resources,
};

export async function readDocumentation(file: string) {
  if (!(file in documents)) throw new Error("Unknown document");
  return documents[file];
}
