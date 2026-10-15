<img src="kernel/assets/icon-512.png" width="72" align="right" alt="">

# skin

**A web app that every person who signs in grows into their own: each account gets its own agent, which rewrites that person's copy of the app while they use it, and can't brick it. A reference for [Pi Durable](https://github.com/earendil-works/pi/tree/main/packages/durable), [Worker Loader](https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/), [Effect v4](https://effect.website), and [Foldkit](https://foldkit.dev) on Cloudflare.**

Self-modifying agents like [bb](https://getbb.app) and [Ouroboros](https://github.com/razzant/ouroboros) evolve one repository on one machine: the tool itself. skin evolves per person. It is a web app behind a login; anyone with a Cloudflare account signs in and gets their own body and their own agent, and every change that agent makes lands only in that person's app. Everyone starts from the same seed and grows apart.

Self-modifying tools let an agent change the app you are working in. The catch is the failure mode: one bad change and the tool you need to fix it is the thing that's broken. skin splits itself in two. A small **kernel**, deployed once, holds the agent, the generations, and the gate. Everything else, the **body**, is source the agent edits at runtime: the Foldkit UI (including the chat you talk to it through), the server, the styles, and the checks. A change goes live only after the kernel builds it into a new generation inside Cloudflare and it passes the gate. If a generation still crashes in your browser, the kernel rolls it back on its own.

Skin is the part of you that is yours alone, that you can change, and that grows back. Here it is the whole app, not just its look: your agent rewrites the UI, the server, and the chat itself.

## What happens when you ask for a change

```
you ─▶ chat (part of the body) ─▶ Agent DO (Pi Durable) ─▶ write_file / ship
                                                              │
                     Body DO: draft ─▶ Builder DO: worker-bundler + Tailwind ─▶ generation N
                                                              │
               gate: bundle ▸ boot the server in a Worker Loader isolate ▸ run src/checks.ts ▸ page
                                                              │
                        pass ─▶ N is live (one pointer)      fail ─▶ rejected, N-1 stays live
                                                              │
               browser: crash guard ─▶ started? boots += 1 : crashed before start ─▶ roll back to N-1
```

1. The agent edits the **draft**: files in the Body Durable Object's SQLite, content-addressed. Nothing is live yet.
2. `ship` freezes the draft as generation N and hands it to a Builder Durable Object, which installs `package.json` from npm and bundles the server and client with [`@cloudflare/worker-bundler`](https://www.npmjs.com/package/@cloudflare/worker-bundler) (esbuild-wasm), then compiles Tailwind v4 in the isolate.
3. The gate loads N's server into its own Worker Loader isolate (no network, no secrets, only `env.STORE`), calls `/_body/health`, and runs the body's own checks at `/_body/checks`. These are the same Foldkit story tests CI runs.
4. If every check passes, N goes live by moving one pointer. If any fails, N is rejected and the agent gets the errors.
5. Every page carries a kernel-owned crash guard. If N renders, it reports a boot. If N crashes before it ever started, the kernel makes the last good generation live again.

Rollback to any generation that passed the gate is instant, from the chat, the kernel console at `/_kernel/`, or the agent. It also resets the draft to match. Data the server keeps in `env.STORE` survives every generation and every rollback.

The agent survives being killed. Pi Durable commits each model turn and tool result to SQLite, and every tool, `ship` included, is safe to replay: shipping the same files again returns the earlier result instead of a second generation.

## Proof

`npm run e2e` drives a real instance through eight changes, good and broken, in a real browser, and writes `receipts/e2e-<target>.json`. Against `wrangler dev` (receipt `receipts/e2e-local.json`):

```
pass  the seed grows into a live generation that starts in a real browser (23575 ms)
pass  a change that does not bundle is rejected and the live app is untouched (84 ms)
pass  a server that throws when it starts is rejected (14133 ms)
pass  a change that breaks a behavior the checks cover is rejected (14230 ms)
pass  data the server stores survives a new generation and a rollback (10 ms)
pass  a good change goes live and renders in the browser (20510 ms)
pass  a page that crashes in the browser is rolled back by the kernel on its own (14517 ms)
pass  rolling back makes the seed live again and resets the draft to match (38 ms)
pass  another person gets their own app, untouched by everything above (14029 ms)

9/9 scenarios passed in 100 s
```

`npm run check` also runs the agent itself, with Pi's fake model, inside workerd: it is killed three times with `ctx.abort()` while it works, comes back each time, and ships exactly one generation ([`test/revival/`](test/revival)).

## Run it locally

You need Node 22.19 or newer.

```sh
npm install
npx playwright install chromium   # for the e2e run
bash test/local/run.sh            # http://localhost:8790, loopback dev identity, no model calls
BASE=http://localhost:8790 npm run e2e
```

`test/local/wrangler.jsonc` is the real kernel with a loopback-only dev identity (`X-Dev-User`), so everything but the chat works offline. The dev identity has no Cloudflare account, so chat answers "Sign in with Cloudflare first". The first request grows generation 1 from the seed (about 20 s).

## Deploy

skin has one sign-in: Sign in with Cloudflare. Each person signs in on Cloudflare's consent screen and picks the accounts skin may use. **The signed-in person always pays for their own model calls.** In `/settings` they pick one of those accounts, a route, and a model:

- **Workers AI, direct**: `api.cloudflare.com/client/v4/accounts/<their account>/ai/v1`, sent with `Authorization: Bearer <their token>`.
- **One of their own AI Gateways** (authentication on): `gateway.ai.cloudflare.com/v1/<their account>/<their gateway>/<anthropic|openai|compat>`, sent with `cf-aig-authorization: Bearer <their token>`. This route is needed for Claude and GPT.

Every call strips `authorization`, `cf-aig-authorization` and `x-api-key`, then adds that person's token. The token is refreshed when it is close to expiring. The Worker has no AI binding and no gateway of its own, so it cannot run a model on the deployer's account. A conversation with no signed-in owner gets "Sign in with Cloudflare first" and no model call is made.

There is no `workers.dev` or preview URL. Worker Loader must be enabled on the account.

1. Create an OAuth client: response type `code`, grant types `authorization_code` and `refresh_token`, redirect URI `https://<host>/oauth/callback`, scopes `offline_access user-details.read account-settings.read ai.read ai.write aig.read aig.run`.
2. Fill in `deploy/coey.env` (or your own copy) with `SKIN_HOST`, `OAUTH_CLIENT_ID`, and `SKIN_ZONE` if the zone has no custom-domain slots left.
3. Set the two Worker secrets: `npx wrangler secret put OAUTH_CLIENT_SECRET` and `npx wrangler secret put SESSION_SECRET` (32 characters or more).
4. Deploy: `set -a; . deploy/coey.env; set +a; npm run deploy`. The deploy runs `scripts/prod-smoke.mjs` against the new version and rolls back if it fails.

The smoke test runs headless with a signed-in session cookie (`SMOKE_SESSION`, or `.debug/session.txt`). It checks that an anonymous caller is refused, that a fresh build goes live, that a model call goes to the signed-in person's own account, and that a real chat reply comes back.

Chat in every instance is held to [Basic](https://github.com/acoyfellow/basic), the conformance suite for agent chat. Run `BASE=https://<host> npm run basic` to check the floor.

## What it deliberately does not do

- **It does not let the agent change the kernel.** Sign-in, the gate, rollback, the crash guard, the service worker, and the console are fixed at deploy. `src/kernel/protocol.ts` in the body is replaced on every build, so the agent cannot break the contract with the kernel.
- **It does not typecheck generations.** esbuild strips types; the gate is bundle, boot, checks, and page. A type error that still runs gets through.
- **It does not roll back crashes after start.** A generation that started once and crashes later is reported to the guard and shown in a banner, but stays live until you or the agent roll back.
- **It does not give body code the network or any secret.** Generations run with `globalOutbound: null`. The only binding is `STORE`.
- **It does not share generations between people.** Each signed-in identity has its own Body, agents, generations, and `STORE`, keyed by a hash of the Cloudflare user id. Nothing crosses between them; there is no way yet to fork someone else's app.
- **It does not meter the model per person.** Builds are limited per person (one at a time, 30 an hour); Workers AI usage is not yet.

## Where to edit behavior

| Path | What it does |
| --- | --- |
| `kernel/body.ts` | The Body DO: draft, generations, the gate, promote, rollback, crash reports, serving |
| `kernel/build.ts` | How a generation is built: bundle, Tailwind, the page the kernel wraps around it |
| `kernel/harness.ts` | The agent's prompt and tools, on Pi Durable |
| `kernel/shell.ts` | The crash guard, service worker, manifest, and kernel console |
| `kernel/index.ts`, `kernel/auth/` | Sign in with Cloudflare, per-user model routing, routes, the owner API under `/_kernel/api/` |
| `body/` | The seed: the first generation. After that, the agent owns it. `body/AGENTS.md` is its guide |
| `shared/protocol.ts` | Schemas for everything that crosses a boundary |

## What this makes possible next

The gate is the product. Because every generation is a stored, replayable artifact with a machine-readable report, the same loop can run unattended: a scheduled job can ask for a change, ship it, and keep it only if its own eval improves, with every attempt, rejected or not, kept as evidence.

## License

MIT
