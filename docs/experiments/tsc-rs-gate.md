# Can tsc-rs type-check a generation inside the gate?

**Verdict: not yet.** The checker gives correct results on the full body, but checking anything that imports Effect needs more memory than a Worker isolate has. It would not fit in a Builder Durable Object.

## Setup

- tsc-rs commit `dfb3ca6`, small WebAssembly build (4.7 MB), the same module [tsc-rs.coey.dev](https://tsc-rs.coey.dev) deploys.
- Input: the seed body (`body/src`, test files excluded), `shared/protocol.ts` placed where the build puts it, and the type declarations of `effect` 4.0.0, `foldkit` 0.168.0 and `@effect/platform-browser` 4.0.0.
- `body/tsconfig.json` unchanged (strict, `lib: ["es2024", "DOM", "DOM.Iterable"]`).
- Measured in Node 24 on an M-series Mac. "Checker memory" is the size of the WebAssembly linear memory at the end of the run, which is the part that counts against a Worker's 128 MB.

## Results

| Input | Files | Time | Checker memory | Result |
|---|---|---|---|---|
| All declarations of the three packages | 761 | 0.88 s | 169 MB | 0 errors |
| Same, with one wrong assignment added | 761 | 0.89 s | 170 MB | TS2322, the one error |
| Only the 334 declaration files the checker reads | 356 | 0.87 s | 169 MB | 0 errors |
| One body file at a time | ~200 | 0.52–0.57 s | 135–145 MB | |
| A one-line file that imports Effect | ~340 | 0.44 s | 124 MB | |
| A one-line file, DOM lib included | 1 | 0.13 s | 68 MB | |
| A one-line file, no DOM lib | 1 | 0.08 s | 50 MB | |

Trimming the input to the files the checker actually reads, `skipDefaultLibCheck`, and turning off the strict flags each left memory at 169 MB. The cost is the checker's own work on Effect's types, not reading files.

## What it found

- **Correct:** the full body checks clean, and an injected error is reported, the same answer `tsc` gives.
- **Fast enough:** under a second for the whole body.
- **Too big for a Worker:** 124 MB for Effect alone leaves no room under the 128 MB isolate limit once the module and its runtime are loaded.

## What would change the verdict

- A tsc-rs build that uses less memory (an allocator tuned for size, or freeing the program between phases).
- Running the check outside an isolate: a [Container](https://developers.cloudflare.com/containers/) with more memory, called from the gate.
- Checking in the person's browser, as tsc-rs.coey.dev already can, and reporting the result to the kernel as an advisory step. It can't be a gate, because the browser is not trusted.

The spike scripts are in `.debug/tscrs/` (not committed).
