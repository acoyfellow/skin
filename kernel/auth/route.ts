import { Option, Result, Schema } from "effect";

export type RouteKind = "workers-ai" | "gateway";

export type Route = {
	readonly accountId: string;
	readonly kind: RouteKind;
	readonly gateway: string | null;
	readonly model: string;
};

export type RouteAccess = Route & { readonly token: string };

export type AccountOption = { readonly id: string; readonly name: string };

export type GatewayOption = { readonly id: string; readonly authenticated: boolean };

export type ModelOption = { readonly id: string; readonly label: string };

export type RouteChoice = {
	readonly accountId: string;
	readonly route: string;
	readonly model: string;
};

export const DIRECT_ROUTE = "workers-ai";

export const GATEWAY_ROUTE_PREFIX = "gateway:";

export const ROUTE_PLACEHOLDER = "https://route.skin.invalid/v1";

const WORKERS_AI_BASE = "https://api.cloudflare.com/client/v4/accounts";

const GATEWAY_BASE = "https://gateway.ai.cloudflare.com/v1";

export const routeValue = (route: Pick<Route, "kind" | "gateway">): string => (route.kind === "gateway" && route.gateway !== null ? `${GATEWAY_ROUTE_PREFIX}${route.gateway}` : DIRECT_ROUTE);

export const baseUrlFor = (route: Route): string =>
	route.kind === "gateway" && route.gateway !== null
		? `${GATEWAY_BASE}/${encodeURIComponent(route.accountId)}/${encodeURIComponent(route.gateway)}/workers-ai/v1`
		: `${WORKERS_AI_BASE}/${encodeURIComponent(route.accountId)}/ai/v1`;

export const routedUrl = (url: string, route: Route): string => (url.startsWith(ROUTE_PLACEHOLDER) ? `${baseUrlFor(route)}${url.slice(ROUTE_PLACEHOLDER.length)}` : url);

const STRIPPED_HEADERS = ["authorization", "cf-aig-authorization", "x-api-key"];

export const routedHeaders = (original: Headers, access: RouteAccess): Headers => {
	const headers = new Headers(original);

	for (const name of STRIPPED_HEADERS) headers.delete(name);
	headers.set("authorization", `Bearer ${access.token}`);

	if (access.kind === "gateway") headers.set("cf-aig-authorization", `Bearer ${access.token}`);

	return headers;
};

const ModelBody = Schema.fromJsonString(Schema.StructWithRest(Schema.Struct({ model: Schema.String }), [Schema.Record(Schema.String, Schema.Json)]));

export const withChosenModel = (body: string, model: string): string =>
	Option.match(Schema.decodeUnknownOption(ModelBody)(body), { onNone: () => body, onSome: (parsed) => JSON.stringify({ ...parsed, model }) });

export const routedFetch =
	(access: () => Promise<RouteAccess>, send: typeof fetch): typeof fetch =>
	async (input, init) => {
		const request = new Request(input, init);
		const current = await access();
		const hasBody = request.method !== "GET" && request.method !== "HEAD";

		return send(
			new Request(routedUrl(request.url, current), {
				method: request.method,
				headers: routedHeaders(request.headers, current),
				body: hasBody ? withChosenModel(await request.text(), current.model) : null,
				signal: request.signal,
			}),
		);
	};

export type InvalidChoice = { readonly field: "account" | "route" | "model"; readonly message: string };

const invalid = (field: InvalidChoice["field"], message: string): Result.Result<Route, InvalidChoice> => Result.fail({ field, message });

export const validateChoice = (
	choice: RouteChoice,
	accounts: ReadonlyArray<AccountOption>,
	gateways: ReadonlyArray<GatewayOption>,
	models: ReadonlyArray<ModelOption>,
): Result.Result<Route, InvalidChoice> => {
	if (!accounts.some((account) => account.id === choice.accountId)) return invalid("account", "Pick one of the accounts you gave skin access to.");

	if (!models.some((model) => model.id === choice.model)) return invalid("model", "Pick one of the listed models.");

	if (choice.route === DIRECT_ROUTE) return Result.succeed({ accountId: choice.accountId, kind: "workers-ai", gateway: null, model: choice.model });

	if (!choice.route.startsWith(GATEWAY_ROUTE_PREFIX)) return invalid("route", "Pick Workers AI or one of your AI Gateways.");

	const gateway = choice.route.slice(GATEWAY_ROUTE_PREFIX.length);
	const found = gateways.find((each) => each.id === gateway);

	if (found === undefined) return invalid("route", "That AI Gateway is not on this account.");

	if (!found.authenticated) return invalid("route", "Turn on authentication for that AI Gateway first, or pick another route.");

	return Result.succeed({ accountId: choice.accountId, kind: "gateway", gateway, model: choice.model });
};
