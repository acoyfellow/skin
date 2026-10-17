<img src="kernel/assets/icon-512.png" width="72" align="right" alt="">

# skin

**An app you change by asking.** Sign in with Cloudflare and you get your own copy of a web app with an agent inside. Ask for a change in plain words and the agent rewrites the app while you use it: the UI, the server, even the chat you're typing into. A new version only goes live if it builds, boots, and passes its checks. If it still breaks in your browser, it rolls back on its own.

Try it at [skin.coey.dev](https://skin.coey.dev). It installs as an app on iOS, Android, and desktop.

<img src="kernel/assets/og.jpg" alt="skin: an app you change by asking">

## Why it can't brick itself

An agent that edits the tool you're using has an obvious failure mode: one bad change, and the thing you need to fix it is the thing that's broken. skin splits in two.

- **The kernel** is deployed once and never changes at runtime. It holds sign-in, the agent, every version, the gate, and rollback.
- **The body** is everything else: the [Foldkit](https://foldkit.dev) UI, the server, the Tailwind styles, and the body's own checks. This is the source the agent edits.

The agent can rewrite the body as much as it likes. It can't touch the kernel, so there is always a working way back.

## What happens when you ask for a change

```
you ─▶ chat ─▶ agent (Pi Durable) ─▶ write_file … ship
                                          │
                 draft ─▶ build: bundle server + client, compile Tailwind ─▶ version N
                                          │
           gate: boot the server in its own isolate ▸ run the body's checks ▸ render the page
                                          │
                pass ─▶ N is live          fail ─▶ N is rejected, N-1 stays live
                                          │
           in your browser: N crashes before it starts ─▶ the kernel puts N-1 back
```

1. The agent edits a draft. Nothing is live yet.
2. `ship` freezes the draft as version N. Builder Durable Objects install its `package.json` from npm, bundle the server and the client with [`@cloudflare/worker-bundler`](https://www.npmjs.com/package/@cloudflare/worker-bundler), and compile Tailwind v4. Each half builds in its own isolate.
3. The gate loads N's server into a [Worker Loader](https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/) isolate with no network and no secrets, checks it starts, and runs the body's own story tests.
4. If everything passes, N goes live by moving one pointer. If anything fails, N is rejected and the agent gets the errors to fix.
5. Every page carries a crash guard. If N crashes in your browser before it ever started, the kernel makes the last good version live again.

Any version that passed the gate is one click away, from the chat, the Versions panel, or the agent. Data the app stores survives every version and every rollback. The agent survives being killed mid-task: each model turn and tool result is committed before the next one, and shipping the same files twice returns the first result instead of a second version.

## Who pays for the model

The person signed in, always. In **Model settings** you pick one of the Cloudflare accounts you allowed, then a route:

- **Workers AI**, on that account, with your token.
- **One of your own AI Gateways** (authentication on), with your token. Use this for Claude and GPT.

Before each call skin strips any credential headers, then adds your token for the account you chose. The Worker has no AI binding and no gateway of its own, so it cannot run a model on the deployer's bill, and it never holds a provider key. A chat with nobody signed in makes no model call.

## Proof

`npm run e2e` drives a real instance through ten changes, good and broken, in a real browser, and writes a receipt to `receipts/`. The latest local run:

```
pass  the seed grows into a live generation that starts in a real browser
pass  a change that does not bundle is rejected and the live app is untouched
pass  a server that throws when it starts is rejected
pass  a change that breaks a behavior the checks cover is rejected
pass  data the server stores survives a new generation and a rollback
pass  a version interrupted mid-build by a kill never sticks, and shipping again makes it live
pass  a good change goes live and renders in the browser
pass  a page that crashes in the browser is rolled back by the kernel on its own
pass  rolling back makes the seed live again and resets the draft to match
pass  another person gets their own app, untouched by everything above

10/10 passed in 141 s
```

Every deploy runs `scripts/prod-smoke.mjs` against production and rolls the Worker back if any step fails. It checks four things:

- a new visitor can start sign-in;
- an anonymous caller is refused;
- a fresh build goes live;
- a real chat reply comes back from the signed-in person's own account.

`npm run check` adds type checks, lint, and 64 tests, one of which kills the agent three times inside workerd and checks it comes back and ships exactly once. `npm run audit:pwa` checks the install assets and SEO basics against a live URL. Chat is held to [Basic](https://github.com/acoyfellow/basic), the conformance suite for agent chat.

## Run it locally

You need Node 22.19 or newer.

```sh
npm install
npx playwright install chromium
bash test/local/run.sh                # http://localhost:8790
BASE=http://localhost:8790 npm run e2e
```

The local kernel uses a loopback-only dev identity, so building, the gate, and rollback all work offline. Chat needs a Cloudflare sign-in, so it answers "Sign in with Cloudflare first". The first page load grows version 1 from the seed in about 20 seconds.

## Deploy your own

You need a Cloudflare account with Worker Loader enabled and a hostname on a zone you control. There is no `workers.dev` or preview URL.

1. Create an OAuth client in the dashboard (Manage Account → OAuth clients): response type `code`, grants `authorization_code` and `refresh_token`, redirect URI `https://<host>/oauth/callback`, scopes `offline_access user-details.read account-settings.read ai.read ai.write aig.read aig.run`.
2. Copy `deploy/coey.env` and set `SKIN_HOST`, `OAUTH_CLIENT_ID`, and `SKIN_ZONE` if the zone has no custom-domain slots left.
3. Set two Worker secrets, `OAUTH_CLIENT_SECRET` and `SESSION_SECRET` (32 characters or more), with `npx wrangler secret put`.
4. Run `set -a; . deploy/<yours>.env; set +a; npm run deploy`.

Deploys need a signed-in session cookie for the smoke test, in `SMOKE_SESSION` or `.debug/session.txt`. Pass `--skip-smoke` to deploy without it.

## What it does not do

- **The agent can't change the kernel.** Sign-in, the gate, rollback, the crash guard, and the service worker are fixed at deploy. The body's copy of the kernel protocol is replaced on every build.
- **Versions aren't type-checked.** The gate is bundle, boot, checks, and page. A type error that still runs gets through.
- **Crashes after start aren't rolled back automatically.** A version that started once and breaks later shows a banner and stays live until you or the agent roll back.
- **Body code has no network and no secrets.** Versions run with `globalOutbound: null`. The only binding is a key-value store.
- **Apps aren't shared.** Each person has their own app, agent, versions, and data. There's no way yet to fork someone else's.
- **Model usage isn't capped by skin.** Builds are limited to one at a time and 30 an hour per person. Model usage is limited only by your own account.

## Where things live

| Path | What it does |
| --- | --- |
| `kernel/body.ts` | Drafts, versions, the gate, rollback, crash reports, serving |
| `kernel/build.ts`, `kernel/builder.ts` | Building a version: bundle, Tailwind, the page around it |
| `kernel/harness.ts` | The agent's prompt and tools, on [Pi Durable](https://github.com/earendil-works/pi/tree/main/packages/durable) |
| `kernel/auth/` | Sign in with Cloudflare, model settings, per-person model routing |
| `kernel/pwa.ts`, `kernel/shell.ts` | Install assets, SEO, the crash guard, the service worker |
| `body/` | The seed every app starts from. After that, each person's agent owns their copy. `body/AGENTS.md` is its guide |
| `shared/protocol.ts` | Schemas for everything that crosses a boundary |

Built with [Effect v4](https://effect.website), Foldkit, Pi Durable, and Durable Objects on Cloudflare Workers.

## License

MIT
