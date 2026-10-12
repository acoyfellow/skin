# Competitive research: the two Ouroboros projects

Checked 2026-10-12 from each repo's README, architecture docs, and (for razzant) the arXiv abstract. Star counts are from the GitHub API on that date.

There are two unrelated projects with the name. Q00's README itself says so: "if you're looking for [self-rewriting architecture], that's the other one."

## Q00/ouroboros: spec-first "Agent OS" (6,209 stars, 627 forks, Python, MIT, created 2026-01)

**What it is.** A local workflow layer that installs into existing coding agents (Claude Code, Codex, Gemini, OpenCode, Pi, Kiro, and others) as skills and an MCP server. Commands are `ooo interview`, `ooo seed`, `ooo run`, `ooo evaluate`, `ooo evolve`, `ooo ralph`.

**Loop.** A Socratic interview scores "ambiguity" down (to about 0.15), then crystallizes an immutable Seed spec (acceptance criteria, ontology, constraints), then runs a Double Diamond execution, then a 3-stage evaluation: mechanical (free), then semantic, then multi-model consensus. "Evolve" feeds evaluation back into the next Seed until "ontology similarity ≥ 0.95". The grading command is kept out of the contract handed to the agent.

**What it does not do.** It does not modify itself. "Evolution" here means the spec converging, not the tool changing. The product is your codebase, built on any agent.

**Stack around it.** It is the OS layer of three: `ourocode` (TUI shell) and `ouroboros-plugins` (scoped-permission plugin manifest with audit and provenance).

**Overlap with us.** Mostly vocabulary and mindshare: kernel/OS layer, seeds, generations, gates, a loop until convergence. Their "Seed" is our "seed"; their 3-stage gate is a cousin of our gate. Not a product competitor: they make other agents better at building your code; we are an app that rebuilds itself.

## razzant/ouroboros: self-developing agent (1,448 stars, 661 forks, Python, MIT, created 2026-02, v7.6.0)

**What it is.** A general-purpose agent that "can rewrite the implementation it runs on, including its code, architecture, prompts, tools, and dependencies," with persistent identity and memory. It ships as a native desktop app (macOS, Windows, Linux, experimental Android) plus a headless CLI, and runs locally with remote APIs or local GGUF models. Technical report: *Ouroboros: A Self-Developing Frontier Coding Agent with Reviewed Core Evolution* (arXiv 2608.08311).

**Claims.** Self-reported state of the art: Terminal-Bench 2.1 86.74% (Opus 5), OSWorld-Verified 90.69%, CL-Bench 0.2301 rank 1. A statistical tie with Codex CLI on SWE-bench Pro. "Hope": a 161-day public deployment evolving live. The first generation went from v4.1 to v6.2.0 in 48 hours (32 self-evolution cycles).

**How it keeps itself from breaking** (the part that matters for us):
- **Review, not tests, is the main gate.** Every self-change goes through a paid "commit triad" of model reviewers, with a shared spend ceiling (`OUROBOROS_REVIEW_MAX_CYCLES`). Changes land as Git commits.
- **Git branches as generations.** `ouroboros` is the working branch. `ouroboros-stable` is a recovery fallback, updated only by explicit promotion. Stable, QA, and Development feeds are selectable.
- **Protected surfaces.** A "self-modification ladder" of modes: Light refuses edits to its own repo, and Advanced evolves the application layer but not `SAFETY_CRITICAL_PATHS`, the frozen contracts, or the release machinery. `BIBLE.md` is a written constitution.
- **Supervisor process.** It watches worker health, recovers crashed workers, suppresses crash storms, and does planned restarts with handoff. Packaged installs verify a `repo.bundle` manifest at boot.
- **Heavy CI.** Desktop, Android emulator, Docker, and release-provenance pipelines, plus SBOMs.

**Scale of the machinery.** 3,289 files. The architecture book is 13 chapters, and invariants are written as numbered laws. It is very thorough and very complex.

## Where we are different

| | razzant/ouroboros | Q00/ouroboros | Ours |
| --- | --- | --- | --- |
| What changes itself | The agent harness (code, prompts, tools) | Nothing (a spec converges) | The app you use, chat included |
| Where it runs | Your machine (desktop app, local repo) | Inside your coding agent | Cloudflare: a URL and a PWA, nothing to install |
| What keeps it safe | Model review panels + protected paths + a stable branch | Spec gate + 3-stage evaluation of the output | Executable gate (bundle, boot in an isolate, checks, browser start) + the kernel cannot be edited + one-pointer rollback |
| What a bad change can do | Land if reviewers approve; recovery means falling back to stable | N/A | Cannot go live unless it builds, boots, and passes checks; a startup crash in the browser is rolled back automatically |
| Isolation | One process tree on your machine | Host agent's sandbox | Each generation in its own V8 isolate, with no network and no secrets |
| Durability | Supervisor + checkpoints | EventStore lineage | Pi Durable in a Durable Object: survives `ctx.abort()` |
| Evidence | Self-reported benchmarks, traces on Hugging Face | Ambiguity scores | Receipts: e2e scenarios with observed vs expected |

**Takeaways**

1. **"Reviewed" vs "proven" is the differentiator.** razzant's gate is model judgment, which is expensive, probabilistic, and needs a spend ceiling. Ours is executable and costs nothing per check. The pitch writes itself: *their changes pass if reviewers like them; ours pass if they run*. Worth borrowing from them: an optional review lane after the executable gate, never instead of it.
2. **Steal the ladder.** Their Light/Advanced self-modification modes are a good UX idea: "may edit only styles", "may edit UI", "may edit server". It maps cleanly onto our draft paths.
3. **Steal the constitution, small.** Their `BIBLE.md` is 50 KB. Our `body/AGENTS.md` plays the same role at 2 KB. Keep it small, and make it the thing the gate enforces rather than prose.
4. **Their weak spot is weight and locality.** A 3,289-file desktop app with a supervisor process vs one Worker you open on your phone. "Self-modifying app on the edge, nothing to install" has no direct competitor in either project.
5. **Benchmarks are their marketing.** We should not compete on Terminal-Bench. Our equivalent is the bricking eval: N good and N broken change requests, 0 bricked deploys, with receipts.
6. **Naming.** Both projects claim the ouroboros and "eats its own tail" imagery, and Q00 also uses Seed, Ledger, kernel, and generations. We should avoid snake and loop imagery and avoid Q00's capitalized terms in branding (we can keep plain "seed" and "generation" as descriptions).
