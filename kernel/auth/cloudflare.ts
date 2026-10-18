import { Option, Predicate, Result, Schema } from "effect";
import { modelOptionsFor, modelOrDefault } from "./catalog";
import { DIRECT_ROUTE, kindOfRoute, type RouteChoice, routeValue, validateChoice } from "./route";
import { type Directory, DIRECTORY_NAME, type Grant } from "./directory";
import {
  accountsOf,
  gatewaysOf,
  authorizeUrl,
  exchangeCode,
  type OAuthClient,
  OAuthFailed,
  randomToken,
  refreshTokens,
  revoke,
  userInfo,
} from "./oauth";
import {
  clearCookie,
  cookie,
  cookieJar,
  FLOW_TTL_MS,
  parseSession,
  readCookie,
  SESSION_TTL_MS,
  sessionValue,
  sign,
  unsign,
} from "./session";
import { signInPage } from "./sign-in-page";

export const CLOUDFLARE_OWNER_PREFIX = "cf:";

export const TOKEN_REFRESH_MARGIN_MS = 60_000;

export type CloudflareAuthEnv = {
  readonly DIRECTORY: DurableObjectNamespace<Directory>;
  readonly OAUTH_CLIENT_ID?: string;
  readonly OAUTH_CLIENT_SECRET?: string;
  readonly SESSION_SECRET?: string;
};

export type CloudflareAdmission =
  | {
      readonly _tag: "Owner";
      readonly owner: string;
      readonly email: string | null;
    }
  | { readonly _tag: "Response"; readonly response: Response };

type Flow = {
  readonly state: string;
  readonly verifier: string;
  readonly expires: number;
};

const FlowJson = Schema.fromJsonString(
  Schema.Struct({
    state: Schema.String,
    verifier: Schema.String,
    expires: Schema.Number,
  }),
);

const parseFlow = (raw: string | null, now = Date.now()): Flow | null =>
  raw === null
    ? null
    : Option.getOrNull(
        Option.filter(
          Schema.decodeUnknownOption(FlowJson)(raw),
          (flow) => flow.expires > now,
        ),
      );

const html = (
  body: string,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });

const redirect = (location: string, cookies: ReadonlyArray<string> = []) => {
  const headers = new Headers({ location, "cache-control": "no-store" });

  for (const each of cookies) headers.append("set-cookie", each);

  return new Response(null, { status: 302, headers });
};

const wantsJson = (request: Request) =>
  new URL(request.url).pathname.startsWith("/_kernel/api/") ||
  request.headers.get("Upgrade") === "websocket";

export const directoryOf = (env: CloudflareAuthEnv) =>
  env.DIRECTORY.getByName(DIRECTORY_NAME);

export class SignedOut extends Error {}

const anonymousId = async (owner: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`skin:${owner}`));

  return `u${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 20)}`;
};

export const SETTINGS_PATH = "/settings";

export const freshToken = async (
  env: CloudflareAuthEnv,
  owner: string,
  send: typeof fetch = fetch,
): Promise<{ readonly grant: Grant; readonly token: string }> => {
  const directory = directoryOf(env);
  const grant = await directory.grantFor(owner);

  if (grant === null)
    throw new SignedOut(
      "Sign in with Cloudflare again: skin no longer has access to your account.",
    );

  if (grant.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS)
    return { grant, token: grant.accessToken };

  if (grant.refreshToken === null)
    throw new SignedOut(
      "Your Cloudflare sign-in expired. Sign in with Cloudflare again.",
    );

  const tokens = await refreshTokens(
    {
      clientId: env.OAUTH_CLIENT_ID ?? "",
      clientSecret: env.OAUTH_CLIENT_SECRET ?? "",
      redirectUri: "",
    },
    grant.refreshToken,
    send,
  ).catch(() => {
    throw new SignedOut(
      "Your Cloudflare sign-in expired. Sign in with Cloudflare again.",
    );
  });

  const renewed = {
    ...grant,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? grant.refreshToken,
    expiresAt: tokens.expiresAt,
    scope: tokens.scope === "" ? grant.scope : tokens.scope,
  };

  await directory.saveGrant(renewed);

  return { grant: renewed, token: renewed.accessToken };
};

export const cloudflareAuth = (
  env: CloudflareAuthEnv,
  send: typeof fetch = fetch,
) => {
  const secret = env.SESSION_SECRET ?? "";

  const ready =
    (env.OAUTH_CLIENT_ID ?? "") !== "" &&
    (env.OAUTH_CLIENT_SECRET ?? "") !== "" &&
    secret.length >= 32;

  const directory = () => directoryOf(env);

  const clientFor = (request: Request): OAuthClient => ({
    clientId: env.OAUTH_CLIENT_ID ?? "",
    clientSecret: env.OAUTH_CLIENT_SECRET ?? "",
    redirectUri: `${new URL(request.url).origin}/oauth/callback`,
  });

  const page = (
    request: Request,
    error: string | undefined,
    status: number,
  ) => html(signInPage(new URL(request.url).origin, Option.fromNullishOr(error)), status);

  const notReady = (request: Request) =>
    page(
      request,
      "Sign in with Cloudflare is not configured on this instance yet.",
      503,
    );

  const login = async (request: Request) => {
    if (!ready) return notReady(request);

    const flow: Flow = {
      state: randomToken(),
      verifier: randomToken(48),
      expires: Date.now() + FLOW_TTL_MS,
    };

    const jar = cookieJar(request.url);

    return redirect(
      await authorizeUrl(clientFor(request), flow.state, flow.verifier),
      [
        cookie(
          jar,
          jar.flow,
          await sign(secret, JSON.stringify(flow)),
          FLOW_TTL_MS,
        ),
      ],
    );
  };

  const callback = async (request: Request) => {
    if (!ready) return notReady(request);

    const url = new URL(request.url);
    const jar = cookieJar(request.url);
    const denied = url.searchParams.get("error");

    if (denied !== null)
      return page(
        request,
        `Cloudflare did not sign you in: ${url.searchParams.get("error_description") ?? denied}`,
        400,
      );

    const flow = parseFlow(await unsign(secret, readCookie(request, jar.flow)));
    const code = url.searchParams.get("code");

    if (
      flow === null ||
      code === null ||
      url.searchParams.get("state") !== flow.state
    )
      return page(
        request,
        "That sign-in link expired or did not start here. Try again.",
        400,
      );

    try {
      const tokens = await exchangeCode(
        clientFor(request),
        code,
        flow.verifier,
        send,
      );

      const user = await userInfo(tokens.accessToken, send);
      const accounts = await accountsOf(tokens.accessToken, send);
      const [account] = accounts;

      if (account === undefined)
        return page(
          request,
          "You did not give skin access to any Cloudflare account. Sign in again and pick one.",
          403,
        );

      const owner = `${CLOUDFLARE_OWNER_PREFIX}${user.sub}`;

      const previous = await directory().grantFor(owner);
      const kept = previous !== null && accounts.some((each) => each.id === previous.accountId) ? previous : null;

      const session = {
        owner,
        id: randomToken(),
        expires: Date.now() + SESSION_TTL_MS,
      };

      await directory().saveGrant({
        owner,
        email: user.email,
        accountId: kept?.accountId ?? account.id,
        accountName: kept?.accountName ?? account.name,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope,
        routeKind: kept?.routeKind ?? "workers-ai",
        gateway: kept?.gateway ?? null,
        model: kept?.model ?? null,
      });
      await directory().openSession(session.id, owner, session.expires);
      await directory().record(await anonymousId(owner), "signed_in").catch(() => undefined);

      return redirect(kept?.model === null || kept === null ? "/?settings=open" : "/", [
        clearCookie(jar, jar.flow),
        cookie(
          jar,
          jar.session,
          await sign(secret, sessionValue(session)),
          SESSION_TTL_MS,
        ),
      ]);
    } catch (cause) {
      if (cause instanceof OAuthFailed)
        return page(request, cause.message, 502);

      throw cause;
    }
  };

  const sessionOf = async (request: Request) => {
    if (!ready) return null;

    const session = parseSession(
      await unsign(secret, readCookie(request, cookieJar(request.url).session)),
    );

    if (session === null) return null;

    return (await directory().sessionOwner(session.id)) === session.owner
      ? session
      : null;
  };

  const logout = async (request: Request) => {
    const session = await sessionOf(request);

    if (session !== null) {
      const grant = await directory().grantFor(session.owner);

      await directory().closeSession(session.id);

      if (grant !== null) {
        await revoke(
          clientFor(request),
          grant.refreshToken ?? grant.accessToken,
          send,
        );
        await directory().dropGrant(session.owner);
      }
    }

    const jar = cookieJar(request.url);

    return redirect("/", [clearCookie(jar, jar.session)]);
  };

  const settings = async (request: Request, fallbackModel: string): Promise<Response> => {
    const session = await sessionOf(request);

    const signedOut = () => Response.json({ error: "Sign in with Cloudflare at /oauth/login" }, { status: 401 });

    if (session === null) return signedOut();

    const fresh = await freshToken(env, session.owner, send).catch((cause) => {
      if (cause instanceof SignedOut) return null;

      throw cause;
    });

    if (fresh === null) return signedOut();

    const accounts = await accountsOf(fresh.token, send);
    const form = request.method === "POST" ? await request.formData() : null;

    if (form !== null && request.headers.get("origin") !== new URL(request.url).origin) return new Response("cross-origin request refused", { status: 403 });

    const field = (name: string, otherwise: string) => {
      const value = form?.get(name);

      return Predicate.isString(value) ? value : otherwise;
    };

    const accountId = field("account", fresh.grant.accountId);
    const gateways = await gatewaysOf(fresh.token, accountId, send);
    const refreshing = field("intent", "save") === "refresh";
    const savedRoute = routeValue({ kind: fresh.grant.routeKind, gateway: fresh.grant.gateway });
    const requestedRoute = field("route", savedRoute);
    const routeOnAccount = requestedRoute === DIRECT_ROUTE || gateways.some((gateway) => gateway.authenticated && routeValue({ kind: "gateway", gateway: gateway.id }) === requestedRoute);
    const routeChoice = routeOnAccount || !refreshing ? requestedRoute : DIRECT_ROUTE;
    const models = modelOptionsFor(kindOfRoute(routeChoice));
    const requestedModel = field("model", modelOrDefault(fresh.grant.model, fallbackModel));
    const modelFits = models.some((model) => model.id === requestedModel);
    const chosen: RouteChoice = { accountId, route: routeChoice, model: modelFits || !refreshing ? requestedModel : (models[0]?.id ?? fallbackModel) };

    const view = (saved: boolean, error: Option.Option<string>, status = 200) =>
      Response.json(
        { email: fresh.grant.email ?? "", accounts, gateways, models, chosen, saved, error: Option.getOrNull(error), firstTime: fresh.grant.model === null },
        { status, headers: { "cache-control": "no-store" } },
      );

    if (form === null || refreshing) return view(false, Option.none());

    const validated = validateChoice(chosen, accounts, gateways, modelOptionsFor);

    if (Result.isFailure(validated)) return view(false, Option.some(validated.failure.message), 400);

    const route = validated.success;
    const account = accounts.find((each) => each.id === route.accountId);

    await directory().saveGrant({ ...fresh.grant, accountId: route.accountId, accountName: account?.name ?? route.accountId, routeKind: route.kind, gateway: route.gateway, model: route.model });

    return view(true, Option.none());
  };

  const admit = async (request: Request): Promise<CloudflareAdmission> => {
    const { pathname } = new URL(request.url);

    if (pathname === "/oauth/login")
      return { _tag: "Response", response: await login(request) };

    if (pathname === "/oauth/callback")
      return { _tag: "Response", response: await callback(request) };

    if (pathname === "/oauth/logout" && request.method === "POST")
      return { _tag: "Response", response: await logout(request) };

    const session = await sessionOf(request);

    if (session === null)
      return {
        _tag: "Response",
        response: wantsJson(request)
          ? Response.json(
              { error: "sign in with Cloudflare at /oauth/login" },
              { status: 401 },
            )
          : page(request, undefined, 200),
      };

    const grant = await directory().grantFor(session.owner);

    return { _tag: "Owner", owner: session.owner, email: grant?.email ?? null };
  };

  return { admit, settings };
};
