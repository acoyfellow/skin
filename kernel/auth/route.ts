import { Option, Result, Schema } from "effect";

export type RouteKind = "workers-ai" | "gateway";

export type ModelFamily = "anthropic" | "openai" | "compat";

export type Route = {
	readonly accountId: string;
	readonly kind: RouteKind;
	readonly gateway: string | null;
	readonly model: string;
};

export type RouteAccess = Route & { readonly token: string; readonly requestModel: string };

export type AccountOption = { readonly id: string; readonly name: string };

export type GatewayOption = { readonly id: string; readonly authenticated: boolean };

export type ModelOption = { readonly id: string; readonly label: string; readonly family: ModelFamily; readonly group: string };

export type RouteChoice = {
	readonly accountId: string;
	readonly route: string;
	readonly model: string;
};

export const DIRECT_ROUTE = "workers-ai";

export const GATEWAY_ROUTE_PREFIX = "gateway:";

const PLACEHOLDER_ORIGIN = "https://route.skin.invalid";

const FAMILIES: ReadonlyArray<ModelFamily> = ["anthropic", "openai", "compat"];

export const placeholderFor = (family: ModelFamily): string => `${PLACEHOLDER_ORIGIN}/${family}`;

const WORKERS_AI_BASE = "https://api.cloudflare.com/client/v4/accounts";

const GATEWAY_BASE = "https://gateway.ai.cloudflare.com/v1";

export const routeValue = (route: Pick<Route, "kind" | "gateway">): string => (route.kind === "gateway" && route.gateway !== null ? `${GATEWAY_ROUTE_PREFIX}${route.gateway}` : DIRECT_ROUTE);

export const kindOfRoute = (value: string): RouteKind => (value.startsWith(GATEWAY_ROUTE_PREFIX) ? "gateway" : "workers-ai");

export const baseUrlFor = (route: Route, family: ModelFamily): string =>
	route.kind === "gateway" && route.gateway !== null
		? `${GATEWAY_BASE}/${encodeURIComponent(route.accountId)}/${encodeURIComponent(route.gateway)}/${family}`
		: `${WORKERS_AI_BASE}/${encodeURIComponent(route.accountId)}/ai/v1`;

export const routedUrl = (url: string, route: Route): string => {
	const family = FAMILIES.find((each) => url.startsWith(placeholderFor(each)));

	return family === undefined ? url : `${baseUrlFor(route, family)}${url.slice(placeholderFor(family).length)}`;
};

const STRIPPED_HEADERS = ["authorization", "cf-aig-authorization", "x-api-key"];

export const routedHeaders = (original: Headers, access: RouteAccess): Headers => {
	const headers = new Headers(original);

	for (const name of STRIPPED_HEADERS) headers.delete(name);
	headers.set(access.kind === "gateway" ? "cf-aig-authorization" : "authorization", `Bearer ${access.token}`);

	return headers;
};

const ModelBody = Schema.fromJsonString(Schema.StructWithRest(Schema.Struct({ model: Schema.String }), [Schema.Record(Schema.String, Schema.Json)]));

export const withRequestModel = (body: string, model: string): string =>
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
				body: hasBody ? withRequestModel(await request.text(), current.requestModel) : null,
				signal: request.signal,
			}),
		);
	};

export type InvalidChoice = { readonly field: "account" | "route" | "model"; readonly message: string };

const invalid = (field: InvalidChoice["field"], message: string): Result.Result<Route, InvalidChoice> => Result.fail({ field, message });

const gatewayOf = (choice: RouteChoice, gateways: ReadonlyArray<GatewayOption>): Result.Result<string | null, InvalidChoice> => {
	if (choice.route === DIRECT_ROUTE) return Result.succeed(null);

	if (!choice.route.startsWith(GATEWAY_ROUTE_PREFIX)) return Result.fail({ field: "route", message: "Pick Workers AI or one of your AI Gateways." });

	const gateway = choice.route.slice(GATEWAY_ROUTE_PREFIX.length);
	const found = gateways.find((each) => each.id === gateway);

	if (found === undefined) return Result.fail({ field: "route", message: "That AI Gateway is not on this account." });

	return found.authenticated ? Result.succeed(gateway) : Result.fail({ field: "route", message: "Turn on authentication for that AI Gateway first, or pick another route." });
};

export const validateChoice = (
	choice: RouteChoice,
	accounts: ReadonlyArray<AccountOption>,
	gateways: ReadonlyArray<GatewayOption>,
	modelsFor: (kind: RouteKind) => ReadonlyArray<ModelOption>,
): Result.Result<Route, InvalidChoice> => {
	if (!accounts.some((account) => account.id === choice.accountId)) return invalid("account", "Pick one of the accounts you gave skin access to.");

	const gateway = gatewayOf(choice, gateways);

	if (Result.isFailure(gateway)) return Result.fail(gateway.failure);

	const kind: RouteKind = gateway.success === null ? "workers-ai" : "gateway";

	if (!modelsFor(kind).some((model) => model.id === choice.model))
		return invalid("model", kind === "workers-ai" ? "Claude and GPT models need an AI Gateway route. Pick a gateway, or a Workers AI model." : "Pick one of the listed models.");

	return Result.succeed({ accountId: choice.accountId, kind, gateway: gateway.success, model: choice.model });
};
