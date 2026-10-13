<img src="kernel/assets/icon-512.png" width="72" align="right" alt="">

# skin

**A web app that every person who signs in grows into their own: each account gets its own agent, which rewrites that person's copy of the app while they use it, and can't brick it. A reference for [Pi Durable](https://github.com/earendil-works/pi/tree/main/packages/durable), [Worker Loader](https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/), [Effect v4](https://effect.website), and [Foldkit](https://foldkit.dev) on Cloudflare.**

Self-modifying agents like [bb](https://getbb.app) and [Ouroboros](https://github.com/razzant/ouroboros) evolve one repository on one machine: the tool itself. skin evolves per person. It is a web app behind a login; whoever has access signs in and gets their own body and their own agent, and every change that agent makes lands only in that person's app. Everyone starts from the same seed and grows apart.

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
bash test/local/run.sh            # http://localhost:8790, no Access, no Workers AI
BASE=http://localhost:8790 npm run e2e
```

`test/local/wrangler.jsonc` is the real kernel without the AI binding, so everything but the chat works offline. The first request grows generation 1 from the seed (about 20 s). For the chat, run `npx wrangler login` and `npm run dev`, which uses Workers AI through a remote binding.

## Deploy behind Cloudflare Access

skin is locked by default: every request must carry a Cloudflare Access token, which the Worker verifies itself, and there is no `workers.dev` or preview URL. Worker Loader must be enabled on the account.

1. Create a self-hosted Access application for your hostname. Allow whoever should get their own app (an email domain works). For CI, add a Service Auth policy with two service tokens, one per test identity.
2. Deploy with the hostname and the application's values in the environment. Nothing internal is committed: `scripts/deploy.mjs` writes a gitignored `wrangler.deploy.jsonc`.

   ```sh
   SKIN_HOST=skin.example.com ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com ACCESS_AUD=<aud tag> npm run deploy
   ```

3. Run the end-to-end check against it as two people:

   ```sh
   BASE=https://skin.example.com CF_ACCESS_CLIENT_ID=… CF_ACCESS_CLIENT_SECRET=… CF_ACCESS_CLIENT_ID_B=… CF_ACCESS_CLIENT_SECRET_B=… npm run e2e
   ```

## What it deliberately does not do

- **It does not let the agent change the kernel.** The Access check, the gate, rollback, the crash guard, the service worker, and the console are fixed at deploy. `src/kernel/protocol.ts` in the body is replaced on every build, so the agent cannot break the contract with the kernel.
- **It does not typecheck generations.** esbuild strips types; the gate is bundle, boot, checks, and page. A type error that still runs gets through.
- **It does not roll back crashes after start.** A generation that started once and crashes later is reported to the guard and shown in a banner, but stays live until you or the agent roll back.
- **It does not give body code the network or any secret.** Generations run with `globalOutbound: null`. The only binding is `STORE`.
- **It does not share generations between people.** Each signed-in identity has its own Body, agents, generations, and `STORE`, keyed by a hash of the Access subject. Nothing crosses between them; there is no way yet to fork someone else's app.
- **It does not meter the model per person.** Builds are limited per person (one at a time, 30 an hour); Workers AI usage is not yet.

## Where to edit behavior

| Path | What it does |
| --- | --- |
| `kernel/body.ts` | The Body DO: draft, generations, the gate, promote, rollback, crash reports, serving |
| `kernel/build.ts` | How a generation is built: bundle, Tailwind, the page the kernel wraps around it |
| `kernel/harness.ts` | The agent's prompt and tools, on Pi Durable |
| `kernel/shell.ts` | The crash guard, service worker, manifest, and kernel console |
| `kernel/index.ts`, `kernel/access.ts` | Access check, routes, the owner API under `/_kernel/api/` |
| `body/` | The seed: the first generation. After that, the agent owns it. `body/AGENTS.md` is its guide |
| `shared/protocol.ts` | Schemas for everything that crosses a boundary |

## What this makes possible next

The gate is the product. Because every generation is a stored, replayable artifact with a machine-readable report, the same loop can run unattended: a scheduled job can ask for a change, ship it, and keep it only if its own eval improves, with every attempt, rejected or not, kept as evidence.

## License

MIT
