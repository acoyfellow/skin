# You are editing your own body

This directory is the app the owner is using right now, including the chat you are talking through. You can change any of it. The kernel cannot be changed: it builds what you write, checks it, and only then makes it live.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | The page shell. Keep `<div id="root">`. The kernel adds the stylesheet, the client bundle, the PWA tags, and the crash guard. |
| `src/entry.ts` | The client entry: a Foldkit app (`Runtime.makeApplication`). |
| `src/styles.css` | Tailwind v4. Only `@import "tailwindcss";` may be imported. Classes are found by scanning every `.ts` and `.html` file. |
| `src/server.ts` | The server: `export default { fetch(request, env) }`. It runs in its own isolate per generation, with no network access. |
| `src/checks.ts` | Checks that must all pass before a generation goes live. They run inside the new server. |
| `src/kernel/protocol.ts` | The kernel's contract (schemas for every request and frame). Read-only: the kernel replaces it on every build. |
| `package.json` | Dependencies, installed from npm on every build. Effect stays at exactly `4.0.0`. |

The server gets `env.STORE` (`get`, `put`, `delete`, `list(prefix)`, string values) and `env.GENERATION`. Data in `STORE` survives every generation and every rollback.

Routes under `/_kernel/`, `/sw.js`, and `/manifest.webmanifest` belong to the kernel. `/_body/health` must answer 200 and `/_body/checks` must return `{ checks: [{ name, ok, detail, ms }] }`.

## How a change goes live

1. `write_file` and `delete_file` change the draft. Nothing is live yet.
2. `ship` builds the draft into a new generation and runs the gate: bundle the server and client, compile the styles, boot the server, run `src/checks.ts`, check the page. If any step fails, the generation is rejected, the live app is untouched, and you get the errors. Fix them and ship again.
3. If the new page crashes in a browser before it ever starts, the kernel rolls back by itself.

## Rules

- Read a file before you replace it. Write whole files.
- Add a check to `src/checks.ts` for each behavior you add to `update`.
- Use Effect for anything that can fail, and Schema for data that crosses a boundary.
- Never remove the chat or the generations panel without being asked. They are how the owner reaches you.

## Foldkit commands: the one shape that works

Every command is `Command.define(name, { args?, messages, execute })`. `execute` is an Effect when there are no `args`, and a function returning an Effect when there are. Copy `Send` or `LoadConversations` in `src/command.ts`.

```ts
export const LoadThing = Command.define("LoadThing", {
	messages: [Message.LoadedThing, Message.FailedThing],
	execute: Effect.gen(function* () {
		const response = yield* Effect.tryPromise(() => fetch("/api/thing"));

		return Message.LoadedThing({ text: yield* Effect.promise(() => response.text()) });
	}).pipe(Effect.catch((error) => Effect.succeed(Message.FailedThing({ reason: String(error) })))),
});

export const SaveThing = Command.define("SaveThing", {
	args: { text: Schema.String },
	messages: [Message.SavedThing],
	execute: ({ text }) => Effect.tryPromise(() => fetch("/api/thing", { method: "POST", body: text })).pipe(Effect.as(Message.SavedThing()), Effect.orDie),
});
```

Never do these. Each one built, passed every check, then crashed in the browser with `effect.pipe is not a function` and was rolled back:

- `execute: () => Effect.gen(...)` with no `args`. Without `args`, `execute` must be the Effect itself, not a function.
- `execute: async () => ...`, a Promise, or a plain value. It must be an Effect.
- Returning a command from `update` without calling it: write `commands: [LoadThing()]`, not `commands: [LoadThing]`.
- A helper such as `ask(...)` that returns a Promise or a function instead of an Effect.

## Style

- Change the theme by editing the `@theme` tokens in `src/styles.css`. Do not hard-code colors in views.
- One small change per ship. If a ship is blocked, read the reason in Versions and fix only that.
