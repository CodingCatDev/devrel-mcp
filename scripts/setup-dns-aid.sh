#!/usr/bin/env bash
set -euo pipefail

# Provisions DNS for AI Discovery (DNS-AID) & ARD records on codingcat.dev (Zone ID: 93fb1edd6363eece91c80081b2723741)
# Requires CLOUDFLARE_API_TOKEN with Zone.DNS:Edit permission on codingcat.dev.

ZONE_ID="${CLOUDFLARE_ZONE_ID:-93fb1edd6363eece91c80081b2723741}"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "Error: CLOUDFLARE_API_TOKEN is required (needs Zone.DNS:Edit permission for codingcat.dev)." >&2
  echo "Alternatively, import apps/web/dns-aid-records.txt directly in the Cloudflare Dashboard -> codingcat.dev -> DNS -> Records -> Import and Export." >&2
  exit 1
fi

create_svcb() {
  local name="$1"
  local value="$2"
  echo "Creating SVCB record: ${name} -> 1 devrel.codingcat.dev. ${value}"
  curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "{
      \"type\": \"SVCB\",
      \"name\": \"${name}\",
      \"ttl\": 3600,
      \"data\": {
        \"priority\": 1,
        \"target\": \"devrel.codingcat.dev.\",
        \"value\": \"${value}\"
      }
    }" | jq '{success, errors, name: .result.name, type: .result.type}'
}

create_svcb "_index._agents.devrel.codingcat.dev" "alpn=\\\"h2\\\" port=443 mandatory=alpn,port"
create_svcb "_mcp._agents.devrel.codingcat.dev" "alpn=\\\"h2,mcp\\\" port=443 mandatory=alpn,port"
create_svcb "_a2a._agents.devrel.codingcat.dev" "alpn=\\\"h2,a2a\\\" port=443 mandatory=alpn,port"

echo "Creating TXT record: _catalog._agents.devrel.codingcat.dev"
curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "TXT",
    "name": "_catalog._agents.devrel.codingcat.dev",
    "ttl": 3600,
    "content": "\"url=https://devrel.codingcat.dev/.well-known/ai-catalog.json\""
  }' | jq '{success, errors, name: .result.name, type: .result.type}'
