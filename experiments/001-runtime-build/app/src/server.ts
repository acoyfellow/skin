import { Effect } from "effect";
export default {
	fetch: (request: Request) => Effect.runPromise(Effect.succeed(Response.json({ ok: true, path: new URL(request.url).pathname }))),
};
