import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  OAuthClientProvider,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { config } from "../config.js";

const TOKEN_CACHE_PATH = path.join(process.cwd(), "data", "zepto-oauth-cache.json");
const REDIRECT_URL = "http://localhost:8090/callback";

interface OAuthCache {
  clientInformation?: OAuthClientInformationFull;
  tokens?: OAuthTokens;
  codeVerifier?: string;
}

function loadCache(): OAuthCache {
  try {
    const raw = fs.readFileSync(TOKEN_CACHE_PATH, "utf-8");
    return JSON.parse(raw) as OAuthCache;
  } catch {
    return {};
  }
}

function saveCache(cache: OAuthCache): void {
  fs.mkdirSync(path.dirname(TOKEN_CACHE_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

/**
 * Disk-backed OAuth provider so the access/refresh token survives across
 * process runs and we don't have to re-authorize every time we talk to the
 * Zepto MCP server.
 */
class FileOAuthClientProvider implements OAuthClientProvider {
  get redirectUrl(): string {
    return REDIRECT_URL;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [REDIRECT_URL],
      client_name: "butler-nutritionist",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  clientInformation(): OAuthClientInformationFull | undefined {
    return loadCache().clientInformation;
  }

  saveClientInformation(clientInformation: OAuthClientInformationFull): void {
    saveCache({ ...loadCache(), clientInformation });
  }

  tokens(): OAuthTokens | undefined {
    return loadCache().tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    saveCache({ ...loadCache(), tokens });
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    // We can't open a real browser from this environment. Print the URL so
    // a human can open it, complete the Zepto OAuth consent flow, and hand
    // back the resulting authorization code / callback URL.
    // eslint-disable-next-line no-console
    console.log(`\nOpen this URL in a browser to authorize Butler with Zepto:\n${authorizationUrl.toString()}\n`);
  }

  saveCodeVerifier(codeVerifier: string): void {
    saveCache({ ...loadCache(), codeVerifier });
  }

  codeVerifier(): string {
    const verifier = loadCache().codeVerifier;
    if (!verifier) throw new Error("No code verifier saved");
    return verifier;
  }
}

let client: Client | null = null;

export async function getZeptoMcpClient(): Promise<Client> {
  if (client) return client;
  const authProvider = new FileOAuthClientProvider();
  const transport = new StreamableHTTPClientTransport(new URL(config.zeptoMcpUrl), {
    authProvider,
  });
  client = new Client({ name: "butler-nutritionist", version: "0.1.0" });
  await client.connect(transport);
  return client;
}
