import { Context, Effect, Layer, Option, Predicate, Schema } from "effect";
import { HttpRouter } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";
import {
	AgentRpcs,
	AgentUnavailable,
	BODY_SOCKET_PATH,
	BodyStateJson,
	BootReportJson,
	ConversationListJson,
	ConversationName,
	FilesUnavailable,
	KERNEL_PREFIX,
	KillOutcomeJson,
	StopOutcomeJson,
	ReadOutcomeJson,
	REPORT_PATH,
	RollbackOutcomeJson,
	RPC_PATH,
	SendOutcomeJson,
	ShipReportJson,
	SnapshotJson,
} from "../shared/protocol";
import { Agent, type AgentEnv } from "./agent";
import { CodeTools } from "./code-tools";
import { TOOL_LIST, TOOLS_PATH } from "./tool-list";
import { statsPage } from "./stats-page";
import { Body } from "./body";
import { Builder } from "./builder";
import { harden, robots, sitemap } from "./pwa";
import { kernelAsset, publicAsset } from "./shell";
import { agentName, devSubject, type Person, type UserId, userIdOf } from "./identity";
import { BodyStore } from "./store";
import { type CloudflareAuthEnv, cloudflareAuth, SETTINGS_PATH } from "./auth/cloudflare";
import { COMMAND_SETTINGS_PATH } from "./command-center";
import { checkRoute } from "./auth/route-check";
import { Directory, DIRECTORY_NAME } from "./auth/directory";

export { Agent, Body, Builder, BodyStore, CodeTools, Directory };

type Env = AgentEnv &
	CloudflareAuthEnv & {
	readonly AGENT: DurableObjectNamespace<Agent>;
	readonly LOCAL_DEV_WITHOUT_ACCESS?: string;
	readonly CF_VERSION_METADATA?: WorkerVersionMetadata;
};

const SOCKET_ROUTE = /^\/_kernel\/api\/c\/([^/]+)\/ws$/;

const decodeName = Schema.decodeUnknownOption(ConversationName);

export const isSameOrigin = (request: Request): boolean => request.headers.get("Origin") === new URL(request.url).origin;

const refuse = (status: number, reason: string) => new Response(reason, { status });

const agentFor = (env: Env, user: UserId, name: ConversationName) => env.AGENT.getByName(agentName(user, name));

const decodeSnapshot = Schema.decodeEffect(SnapshotJson);

const decodeSend = Schema.decodeEffect(SendOutcomeJson);

const decodeKill = Schema.decodeEffect(KillOutcomeJson);

const decodeStop = Schema.decodeEffect(StopOutcomeJson);

const decodeRead = Schema.decodeEffect(ReadOutcomeJson);

const decodeBodyState = Schema.decodeEffect(BodyStateJson);

const decodeRollback = Schema.decodeEffect(RollbackOutcomeJson);

const decodeConversations = Schema.decodeEffect(ConversationListJson);

const decodeShipReport = Schema.decodeEffect(ShipReportJson);

const decodeReport = Schema.decodeUnknownOption(BootReportJson);

const bodyOf = (env: Env, user: UserId) => env.BODY.getByName(user);

const bodyCall = <A>(promise: () => Promise<A>): Effect.Effect<A, FilesUnavailable> => Effect.tryPromise({ try: promise, catch: (cause) => new FilesUnavailable({ reason: String(cause) }) });

const unavailable = (cause: unknown) => new AgentUnavailable({ reason: String(cause) });

const call = <A>(promise: () => Promise<A>): Effect.Effect<A, AgentUnavailable> => Effect.tryPromise({ try: promise, catch: unavailable });

const isKilled = Predicate.isTagged("Killed");

const storedKills = (env: Env, user: UserId, name: ConversationName) =>
	call(() => agentFor(env, user, name).getSnapshot(name)).pipe(
		Effect.flatMap(decodeSnapshot),
		Effect.catchTag("SchemaError", Effect.die),
		Effect.map((snapshot) => snapshot.events.filter(isKilled).length),
	);

const countMessage = async (env: Env, user: UserId, subject: string): Promise<void> => {
	const directory = env.DIRECTORY.getByName(DIRECTORY_NAME);
	const grant = await directory.grantFor(subject).catch(() => null);

	await directory.record(user, "message_sent", grant?.model ?? env.MODEL).catch(() => undefined);
};

const handlers = (env: Env, user: UserId, subject: string) =>
	AgentRpcs.toLayer({
		Snapshot: ({ name }) => call(() => agentFor(env, user, name).getSnapshot(name)).pipe(Effect.flatMap(decodeSnapshot), Effect.catchTag("SchemaError", Effect.die)),
		Send: ({ name, text }) =>
			call(() => agentFor(env, user, name).useInferenceOf(subject)).pipe(
				Effect.andThen(call(() => agentFor(env, user, name).send(name, text))),
				Effect.flatMap(decodeSend),
				Effect.catchTag("SchemaError", Effect.die),
				Effect.flatMap(Effect.fromResult),
				Effect.tap(() => bodyCall(() => bodyOf(env, user).touchConversation(name, text)).pipe(Effect.ignore)),
				Effect.tap(() => Effect.promise(() => countMessage(env, user, subject)).pipe(Effect.ignore)),
			),
		Conversations: () => bodyCall(() => bodyOf(env, user).conversations()).pipe(Effect.flatMap(decodeConversations), Effect.catchTag("SchemaError", Effect.die)),
		DeleteConversation: ({ name }) =>
			call(() => agentFor(env, user, name).forget()).pipe(Effect.andThen(bodyCall(() => bodyOf(env, user).forgetConversation(name)))),
		ResetApp: () => bodyCall(() => bodyOf(env, user).resetApp()).pipe(Effect.flatMap(decodeShipReport), Effect.catchTag("SchemaError", Effect.die)),
		Stop: ({ name }) =>
			call(() => agentFor(env, user, name).stop(name)).pipe(
				Effect.flatMap(decodeStop),
				Effect.catchTag("SchemaError", Effect.die),
				Effect.flatMap(Effect.fromResult),
				Effect.catchTag("AgentUnavailable", () => Effect.void),
			),
		Kill: ({ name }) =>
			Effect.gen(function* () {
				const before = yield* storedKills(env, user, name);

				return yield* call(() => agentFor(env, user, name).kill(name)).pipe(
					Effect.flatMap(decodeKill),
					Effect.catchTag("SchemaError", Effect.die),
					Effect.flatMap(Effect.fromResult),
					Effect.catchTag("AgentUnavailable", (dropped) =>
						storedKills(env, user, name).pipe(
							Effect.orElseSucceed(() => before),
							Effect.flatMap((after) => (after > before ? Effect.void : Effect.fail(dropped))),
						),
					),
				);
			}),
		ReadFile: ({ name, path }) =>
			call(() => agentFor(env, user, name).readFile(name, path)).pipe(Effect.flatMap(decodeRead), Effect.catchTag("SchemaError", Effect.die), Effect.flatMap(Effect.fromResult)),
		Body: () => bodyCall(() => bodyOf(env, user).state()).pipe(Effect.flatMap(decodeBodyState), Effect.catchTag("SchemaError", Effect.die)),
		Rollback: ({ generation }) =>
			bodyCall(() => bodyOf(env, user).rollback(generation)).pipe(Effect.flatMap(decodeRollback), Effect.catchTag("SchemaError", Effect.die), Effect.flatMap(Effect.fromResult)),
	});

const buildRpcHandler = (env: Env, user: UserId, subject: string) =>
	HttpRouter.toWebHandler(
		RpcServer.layerHttp({ group: AgentRpcs, path: RPC_PATH, protocol: "http" }).pipe(
			Layer.provide(handlers(env, user, subject)),
			Layer.provide(RpcSerialization.layerJson),
		),
		{ disableLogger: true },
	).handler;

const rpcHandlers = new WeakMap<Env, Map<string, ReturnType<typeof buildRpcHandler>>>();

const MAX_CACHED_HANDLERS = 64;

const rpcHandler = (env: Env, user: UserId, subject: string): ReturnType<typeof buildRpcHandler> => {
	const forEnv = rpcHandlers.get(env) ?? new Map<string, ReturnType<typeof buildRpcHandler>>();
	const cached = forEnv.get(subject);

	if (cached !== undefined) return cached;

	if (forEnv.size >= MAX_CACHED_HANDLERS) forEnv.clear();

	const built = buildRpcHandler(env, user, subject);

	forEnv.set(subject, built);
	rpcHandlers.set(env, forEnv);

	return built;
};

const rpcRequest = (request: Request): Request => {
	const url = new URL(request.url);

	url.pathname = RPC_PATH;

	return new Request(url, request);
};

const socket = (request: Request, env: Env, user: UserId, rawName: string): Promise<Response> =>
	Option.match(decodeName(rawName), {
		onNone: () => Promise.resolve(refuse(400, "bad conversation name")),
		onSome: (name) => {
			const inner = new URL(request.url);

			inner.searchParams.set("name", name);

			return agentFor(env, user, name).fetch(new Request(inner, request));
		},
	});

const MAX_REPORT = 4096;

const WHO_AM_I = `${KERNEL_PREFIX}/api/me`;

const TEST_ABORT_BODY = `${KERNEL_PREFIX}/api/test/abort-body`;

const CONSOLE_BODY = `${KERNEL_PREFIX}/api/body`;

const CONSOLE_RESEED = `${KERNEL_PREFIX}/api/reseed`;

const OWNER_SHIP = `${KERNEL_PREFIX}/api/ship`;

const OWNER_FILE = /^\/_kernel\/api\/files\/(.+)$/;

const MAX_MESSAGE = 500;

const ownerShip = async (request: Request, env: Env, user: UserId): Promise<Response> => {
	const message = (await request.text()).trim().slice(0, MAX_MESSAGE);

	return bodyOf(env, user)
		.ship(message === "" ? "Shipped by the owner" : message)
		.then((json) => new Response(json, { headers: { "content-type": "application/json" } }));
};

const CONSOLE_ROLLBACK = /^\/_kernel\/api\/rollback\/(\d+)$/;

const report = async (request: Request, env: Env, user: UserId): Promise<Response> => {
	const text = await request.text();

	if (text.length > MAX_REPORT) return refuse(413, "report too large");

	return Option.match(decodeReport(text), {
		onNone: () => refuse(400, "bad report"),
		onSome: async ({ generation, ok, detail }) => new Response(await bodyOf(env, user).report(generation, ok, detail)),
	});
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const isLocalDev = (request: Request, env: Env): boolean => env.LOCAL_DEV_WITHOUT_ACCESS === "1" && LOCAL_HOSTS.has(new URL(request.url).hostname);

type Admission = { readonly _tag: "Admitted"; readonly person: Person } | { readonly _tag: "Refused"; readonly response: Response };

const admitted = (subject: string, email: Option.Option<string>): Effect.Effect<Admission> =>
	Effect.map(userIdOf(subject), (user) => ({ _tag: "Admitted", person: { user, subject, email } }));

const refused = (response: Response): Effect.Effect<Admission> => Effect.succeed({ _tag: "Refused", response });

const admitWithCloudflare = async (request: Request, env: Env): Promise<Admission> => {
	const result = await cloudflareAuth(env).admit(request);

	if (result._tag === "Response") return { _tag: "Refused", response: result.response };

	return Effect.runPromise(admitted(result.owner, Option.fromNullishOr(result.email)));
};

const admit = (request: Request, env: Env): Promise<Admission> =>
	isLocalDev(request, env) ? Effect.runPromise(admitted(devSubject(request), Option.none())) : admitWithCloudflare(request, env);

const whoAmI = (person: Person, env: Env) => Response.json({ user: person.user, email: Option.getOrNull(person.email), version: env.CF_VERSION_METADATA?.id ?? "unknown" });

const SIGN_IN_PATHS = new Set(["/", "/oauth/login", "/oauth/callback", "/oauth/logout"]);

const wantsPage = (request: Request) => request.method === "GET" && (request.headers.get("Accept") ?? "").includes("text/html");

const signedOut = (request: Request, refused: Response): Response => {
	const { pathname } = new URL(request.url);

	if (SIGN_IN_PATHS.has(pathname) || refused.status !== 200) return refused;

	return wantsPage(request) ? new Response(null, { status: 302, headers: { location: "/" } }) : Response.json({ error: "sign in with Cloudflare at /oauth/login" }, { status: 401 });
};

const route = async (request: Request, env: Env): Promise<{ readonly response: Response; readonly indexable: boolean }> => {
	const url = new URL(request.url);

	if (url.pathname === "/robots.txt") return { response: robots(url.origin), indexable: true };

	if (url.pathname === "/sitemap.xml") return { response: sitemap(url.origin), indexable: true };

	if (url.pathname === TOOLS_PATH) return { response: Response.json(TOOL_LIST, { headers: { "cache-control": "no-store" } }), indexable: false };

	if ((url.pathname === "/stats" || url.pathname === "/stats.json") && request.method === "GET") {
		const stats = await env.DIRECTORY.getByName(DIRECTORY_NAME).stats();
		const headers = { "cache-control": "no-store" };

		return {
			response: url.pathname === "/stats.json" ? Response.json(stats, { headers }) : new Response(statsPage(stats, url.origin), { headers: { ...headers, "content-type": "text/html; charset=utf-8" } }),
			indexable: url.pathname === "/stats",
		};
	}

	const open = publicAsset(url.pathname);

	if (Option.isSome(open)) return { response: open.value, indexable: true };

	const admission = await admit(request, env);

	if (admission._tag === "Refused") return { response: signedOut(request, admission.response), indexable: url.pathname === "/" };

	return { response: await serve(request, env, admission.person), indexable: false };
};

export default {
	async fetch(request, env) {
		const { response, indexable } = await route(request, env);

		return harden(response, indexable);
	},
} satisfies ExportedHandler<Env>;

const serve = async (request: Request, env: Env, person: Person): Promise<Response> => {
	{
		const admission = { _tag: "Admitted" as const, person };

		if (new URL(request.url).pathname === `${KERNEL_PREFIX}/api/route-check` && request.method === "POST" && isSameOrigin(request))
			return Response.json(await checkRoute(env, admission.person.subject));

		if (new URL(request.url).pathname === COMMAND_SETTINGS_PATH) return cloudflareAuth(env).settings(request, env.MODEL);

		if (new URL(request.url).pathname === SETTINGS_PATH) return Response.redirect(new URL("/?settings=open", request.url).toString(), 302);

		const { user } = admission.person;

		const { pathname } = new URL(request.url);
		const isWrite = request.method !== "GET" || request.headers.get("Upgrade") === "websocket";
		const isKernel = pathname.startsWith(`${KERNEL_PREFIX}/`);

		if (isWrite && !isSameOrigin(request)) return refuse(403, "cross-origin request refused");

		if (pathname === RPC_PATH || pathname === `${RPC_PATH}/`) return rpcHandler(env, user, admission.person.subject)(rpcRequest(request), Context.empty());

		const socketMatch = SOCKET_ROUTE.exec(pathname);

		if (socketMatch?.[1] !== undefined) {
			return request.headers.get("Upgrade") === "websocket" ? socket(request, env, user, socketMatch[1]) : refuse(426, "expected websocket");
		}

		if (pathname === BODY_SOCKET_PATH) return request.headers.get("Upgrade") === "websocket" ? bodyOf(env, user).fetch(request) : refuse(426, "expected websocket");

		if (pathname === WHO_AM_I && request.method === "GET") return whoAmI(admission.person, env);

		if (pathname === TEST_ABORT_BODY && request.method === "POST" && isLocalDev(request, env)) {
			const aborted = await bodyOf(env, user).abortForTest().then(() => "not aborted", (cause: unknown) => `aborted: ${String(cause)}`);

			return new Response(aborted);
		}

		if (pathname === REPORT_PATH && request.method === "POST") return report(request, env, user);

		if (pathname === CONSOLE_BODY && request.method === "GET") return bodyOf(env, user).state().then((json) => new Response(json, { headers: { "content-type": "application/json" } }));

		if (pathname === CONSOLE_RESEED && request.method === "POST") return bodyOf(env, user).resetApp().then((json) => new Response(json, { headers: { "content-type": "application/json" } }));

		if (pathname === OWNER_SHIP && request.method === "POST") return ownerShip(request, env, user);

		const fileMatch = OWNER_FILE.exec(pathname);

		if (fileMatch?.[1] !== undefined && request.method === "PUT") {
			const path = decodeURIComponent(fileMatch[1]);
			const content = await request.text();

			return bodyOf(env, user).write(path, content).then((text) => new Response(text, { status: text.startsWith("Refused") ? 400 : 200 }));
		}

		if (fileMatch?.[1] !== undefined && request.method === "DELETE") return bodyOf(env, user).remove(decodeURIComponent(fileMatch[1])).then((text) => new Response(text));

		if (fileMatch?.[1] !== undefined && request.method === "GET") {
			const content = await bodyOf(env, user).read(decodeURIComponent(fileMatch[1]));

			return content === null ? refuse(404, "no such file") : new Response(content, { headers: { "content-type": "text/plain; charset=utf-8" } });
		}

		const rollbackMatch = CONSOLE_ROLLBACK.exec(pathname);

		if (rollbackMatch?.[1] !== undefined && request.method === "POST") return bodyOf(env, user).rollback(Number(rollbackMatch[1])).then((json) => new Response(json));

		const asset = kernelAsset(pathname);

		if (Option.isSome(asset)) return asset.value;

		if (isKernel) return refuse(404, "not found");

		return bodyOf(env, user).fetch(request);
	}
};
