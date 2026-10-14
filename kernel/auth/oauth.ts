import { Option, Schema } from "effect";

export const CLOUDFLARE_OAUTH = {
  authorize: "https://dash.cloudflare.com/oauth2/auth",
  token: "https://dash.cloudflare.com/oauth2/token",
  revoke: "https://dash.cloudflare.com/oauth2/revoke",
  userinfo: "https://dash.cloudflare.com/oauth2/userinfo",
  api: "https://api.cloudflare.com/client/v4",
} as const;

export const SCOPES = [
  "offline_access",
  "user-details.read",
  "account-settings.read",
  "ai.read",
  "ai.write",
] as const;

export type OAuthClient = {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
};

export type TokenSet = {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: number;
  readonly scope: string;
};

export class OAuthFailed extends Error {}

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");

export const randomToken = (bytes = 32) =>
  base64Url(crypto.getRandomValues(new Uint8Array(bytes)));

export const pkceChallenge = async (verifier: string) =>
  base64Url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  );

export const authorizeUrl = async (
  client: OAuthClient,
  state: string,
  verifier: string,
) => {
  const url = new URL(CLOUDFLARE_OAUTH.authorize);

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", client.clientId);
  url.searchParams.set("redirect_uri", client.redirectUri);
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", await pkceChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");

  return url.toString();
};

const TokenResponse = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.optional(Schema.String),
  expires_in: Schema.optional(Schema.Number),
  scope: Schema.optional(Schema.String),
});

const ErrorResponse = Schema.Struct({
  error: Schema.optional(Schema.String),
  error_description: Schema.optional(Schema.String),
});

const UserInfoResponse = Schema.Struct({
  sub: Schema.String,
  email: Schema.optional(Schema.NullOr(Schema.String)),
});

const AccountsResponse = Schema.Struct({
  result: Schema.Array(
    Schema.Struct({ id: Schema.String, name: Schema.optional(Schema.String) }),
  ),
});


const tokenRequest = async (
  client: OAuthClient,
  body: Record<string, string>,
  send: typeof fetch,
  now: number,
): Promise<TokenSet> => {
  const response = await send(CLOUDFLARE_OAUTH.token, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${btoa(`${client.clientId}:${client.clientSecret}`)}`,
    },
    body: new URLSearchParams(body).toString(),
  });

  const parsed: unknown = await response.json().catch(() => null);
  const tokens = response.ok ? Schema.decodeUnknownOption(TokenResponse)(parsed) : Option.none();

  if (Option.isNone(tokens)) {
    const problem = Option.getOrUndefined(Schema.decodeUnknownOption(ErrorResponse)(parsed));

    throw new OAuthFailed(
      `Cloudflare refused the token request: ${problem?.error_description ?? problem?.error ?? response.status}`,
    );
  }

  return {
    accessToken: tokens.value.access_token,
    refreshToken: tokens.value.refresh_token ?? null,
    expiresAt: now + (tokens.value.expires_in ?? 3600) * 1000,
    scope: tokens.value.scope ?? "",
  };
};

export const exchangeCode = (
  client: OAuthClient,
  code: string,
  verifier: string,
  send: typeof fetch = fetch,
  now = Date.now(),
) =>
  tokenRequest(
    client,
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: client.redirectUri,
      code_verifier: verifier,
    },
    send,
    now,
  );

export const refreshTokens = (
  client: OAuthClient,
  refreshToken: string,
  send: typeof fetch = fetch,
  now = Date.now(),
) =>
  tokenRequest(
    client,
    { grant_type: "refresh_token", refresh_token: refreshToken },
    send,
    now,
  );

export type CloudflareUser = {
  readonly sub: string;
  readonly email: string | null;
};

export const userInfo = async (
  accessToken: string,
  send: typeof fetch = fetch,
): Promise<CloudflareUser> => {
  const response = await send(CLOUDFLARE_OAUTH.userinfo, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  const parsed: unknown = await response.json().catch(() => null);
  const user = response.ok ? Schema.decodeUnknownOption(UserInfoResponse)(parsed) : Option.none();

  if (Option.isNone(user))
    throw new OAuthFailed(`Cloudflare userinfo failed: ${response.status}`);

  return { sub: user.value.sub, email: user.value.email ?? null };
};

export type CloudflareAccount = { readonly id: string; readonly name: string };

export const accountsOf = async (
  accessToken: string,
  send: typeof fetch = fetch,
): Promise<CloudflareAccount[]> => {
  const response = await send(`${CLOUDFLARE_OAUTH.api}/accounts?per_page=50`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  const parsed: unknown = await response.json().catch(() => null);

  const accounts = response.ok
    ? Schema.decodeUnknownOption(AccountsResponse)(parsed)
    : Option.none();

  if (Option.isNone(accounts))
    throw new OAuthFailed(`Cloudflare accounts failed: ${response.status}`);

  return accounts.value.result.map(({ id, name }) => ({
    id,
    name: name ?? id,
  }));
};

export const revoke = async (
  client: OAuthClient,
  token: string,
  send: typeof fetch = fetch,
) => {
  await send(CLOUDFLARE_OAUTH.revoke, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${btoa(`${client.clientId}:${client.clientSecret}`)}`,
    },
    body: new URLSearchParams({ token }).toString(),
  }).catch(() => undefined);
};
