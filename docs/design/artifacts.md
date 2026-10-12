# Design: each person's agent is a git repo

Status: proposed, 2026-10-12. Starts after the first deploy is proven (receipts/e2e-deployed.json).

## The claim

**One person's skin is one Artifacts repo, and one generation is one commit that pairs the app with the agent.** Rolling back, forking, or cloning a generation always gives back an app and an agent that belong together. Nothing in the repo's history is rewritten.

Falsifiable by: a rollback that restores the app but not the agent's prompt (or the reverse); a fork whose conversation context does not match its code; any rewritten history in a skin's repo; any person able to read or write another person's skin.

## Why

Today a generation versions only the app (the body), as content-addressed blobs in the Body Durable Object's SQLite. That works, but:

- The **agent** is not versioned. Its prompt, tools, and rules are kernel code (`kernel/harness.ts`), the same for everyone. "Each person's experience catered to their own agent setup" needs the agent itself to be per person and evolvable.
- A person cannot **take their skin with them**. There is no `git clone`.
- There is no **fork**: "start from Jordan's skin" is impossible.
- **Outside agents** (Claude Code, Pi on a laptop) cannot propose a change to a skin through a standard interface.

## What we take from coil

coil (acoyfellow/coil) versions a thread as **pairs**: when the transcript compacts, the computer snapshots in the same step, and the ledger records `{ summaryEntry, snapshotId, at }`. A fork or restore from a pair gets a summary and a disk that match. Its image's git cannot force-push, so history cannot be rewritten.

skin applies the same three rules:

1. **Pairs.** A generation records `{ commit, transcriptEntry, at }` per conversation that shipped it. Fork from generation N gives N's app, N's agent, and the conversation up to the entry that shipped N.
2. **The transcript stays the source of truth for the conversation.** Pi Durable owns it, in the Agent Durable Object's SQLite, unchanged. Git owns the app and the agent definition.
3. **Never rewrite history.** Rollback moves the `live` ref, then writes a "Roll back to generation N" commit so `main` matches what is live. Rejected generations stay reachable under `refs/rejected/<n>`, as evidence of what the gate stopped. The kernel never force-pushes.

## The repo

One repo per person, named `skin-<userId>` (the same hashed id the kernel already uses; no email in the name).

```
app/                the body as today: index.html, src/, package.json, checks
agent/
  AGENTS.md         the agent's rules (today body/AGENTS.md)
  prompt.md         who it is and how it works with this person; appended to the kernel preamble
  tools.json        which kernel tools it may call, and limits (e.g. may it edit app/src/server.ts)
  skills/*.md       instructions it has written for itself, loaded into context
  memory.md         durable notes about this person, kept by the agent
```

Refs:

| Ref | Meaning |
| --- | --- |
| `main` | the draft: the agent's working state, one commit per `write_file` batch |
| `refs/tags/gen-<n>` | generation n, immutable once tagged |
| `refs/heads/live` | the generation serving requests; only the kernel moves it, and only to a tag that passed the gate |
| `refs/rejected/<n>` | generations the gate rejected |

## What the kernel keeps, and what it hands over

The kernel stays fixed and outside the repo: the Access check, the gate, rollback, the crash guard, the service worker, the console, and a **preamble** prompt that no repo can remove ("you are one person's skin; you can only change this person's app and agent; ship through the gate"). `src/kernel/protocol.ts` is still replaced on every build.

`agent/` is new evolvable surface, so it is gated too:

- `tools.json` is validated with a Schema. It can only *narrow* the kernel's tools, never add one.
- `prompt.md`, `skills/`, and `memory.md` have size caps (they cost context on every turn).
- A generation whose `agent/` fails validation is rejected like a bundle error.
- The agent applies its new definition on the **next** turn after a ship. It never swaps mid-turn, so Pi Durable's replay always sees one consistent agent for a turn.

## Hot path vs record

The Body Durable Object stays the **single writer** and the fast path. Artifacts is the durable, portable **record**.

| Operation | Today | With Artifacts |
| --- | --- | --- |
| `read_file` | Body SQLite | Body SQLite; on a cold instance, `ArtifactsRepo.readFile({ ref: "main", path })` with no clone |
| `write_file` | Body SQLite draft | Body SQLite draft; pushed to `main` in batches (at ship, and at most every N seconds) |
| `ship` | build from the draft | push `main`, tag `gen-n`, build from that exact commit, gate, then move `live` |
| rollback | move the pointer, reset the draft | move `live` to `gen-m`, then commit "Roll back to generation m" on `main` |
| serving | built output in SQLite | unchanged: built bundles never go into git |
| fork | not possible | `ArtifactsRepo.fork("skin-<newUser>")` at `gen-n`, plus the transcript up to the paired entry |
| clone it yourself | not possible | `/_kernel/api/clone` mints a **read** token (`createToken("read", 3600)`) for your own repo only |
| outside agents | not possible | a short-lived **write** token for `main` only; a push is just a draft until it is shipped through the gate |

Writes use isomorphic-git against the repo's remote (as tardigrade's `worker/files.ts` does). Reads use the binding's `readFile`, `readTree`, and `log`, which need no clone. That removes tardigrade's documented cost of re-cloning on every cold start.

## Failure handling

- **Artifacts down at ship time:** the ship fails with a typed `BodyUnavailable`, and nothing is promoted. The draft is safe in SQLite. The gate never promotes a generation that is not committed and tagged.
- **Push succeeded, kernel killed before tagging:** on revival, the ship replays (it is replay-safe). The tree hash finds the existing commit, and tagging is idempotent.
- **Repo creation in progress** (`CREATE_IN_PROGRESS`): the first visit shows the existing "growing" page and retries.
- **Migration:** existing bodies get a repo on their next ship. The first commit is their current live generation, then the draft.

## Proof (added to the e2e)

1. Rollback restores the agent as well as the app: ship a change to `agent/prompt.md` and the UI, roll back, and the next turn's system prompt and the served page are both the old ones.
2. A fork matches its source: fork generation n into person B. B's live app equals A's `gen-n` tree, and B's conversation ends at the paired entry.
3. History is append-only: after ship, reject, rollback, and fork, every earlier commit is still reachable, and `refs/rejected/*` lists every rejected generation.
4. Isolation: person B's token cannot read `skin-<A>`, and B's clone endpoint only ever mints for `skin-<B>`.
5. An outside push is only a draft: push to `main` with a write token, and nothing goes live until `ship`.

Locally, Artifacts has no simulator. Tests use an in-memory repo behind the same `Repo` interface (as tardigrade's revival test does). The deployed e2e runs against real Artifacts.

## Open questions

- **Quotas:** repos per account, and storage per repo, if all of `@cloudflare.com` signs in.
- **Memory growth:** who prunes `memory.md` and `skills/`, and is pruning itself a gated generation?
- **Sharing UX:** is fork "copy and diverge" only, or can a person follow someone else's skin and pull updates? (Pulling would need merging generations, which is out of scope for v1.)
