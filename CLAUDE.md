# CLAUDE.md — Lobster

## What This Is

Lobster is a workflow runtime for AI agents. It provides deterministic pipelines
with approval gates, an stdlib of composable commands (exec, map, sort, dedupe,
llm.invoke, etc.), and a YAML-based workflow file format. It ships as an npm
package (`@clawdbot/lobster`) with CLI binaries and a programmatic SDK.

## Stack

- **Language**: TypeScript (ES2022, NodeNext modules)
- **Runtime**: Node.js >= 20
- **Package manager**: pnpm
- **Build**: `tsc` — source in `src/`, output in `dist/`
- **Test**: Node.js built-in test runner (`node --test`)
- **Lint**: oxlint (configured in `.oxlintrc.json`)
- **Dependencies**: ajv (JSON schema validation), yaml (workflow file parsing)

## Setup / Test / Lint

```bash
./scripts/bootstrap   # pnpm install + build
./scripts/test        # build + run all tests
./scripts/lint        # oxlint + typecheck
```

Tests require a build first — they run against `dist/test/*.test.js`.
There is no watch mode; rebuild manually after changes.
To run a single test: `pnpm build && node --test dist/test/<name>.test.js`.

## Architecture

```
src/
  cli.ts              # CLI entrypoint (runCli), parses args, dispatches commands
  parser.ts           # Pipeline expression parser (pipe-separated commands)
  runtime.ts          # Pipeline execution engine
  shell.ts            # Shell command spawning (respects LOBSTER_SHELL)
  token.ts            # Resume token encoding/decoding
  resume.ts           # Resume logic for approval workflows
  query.ts            # State querying (lobster query)
  read_line.ts        # Interactive input helper
  commands/
    registry.ts       # Command registry (maps names to handlers)
    stdlib/            # Built-in commands: exec, map, sort, dedupe, llm.invoke, etc.
    workflows/         # Workflow list/run subcommands
  workflows/
    file.ts           # YAML workflow file parser and executor
  state/
    store.ts          # JSON state persistence (LOBSTER_STATE_DIR)
  renderers/
    json.ts           # JSON output renderer
  recipes/
    github/           # GitHub PR monitoring recipe
  sdk/
    Lobster.ts        # Fluent SDK class (.pipe() chains)
    primitives/       # SDK primitives: approve, exec, state, diff
    runtime.ts        # SDK pipeline runner
    index.ts          # Public SDK exports
  core/
    tool_runtime.ts   # Tool-mode runtime wrapper
bin/
  lobster.js          # CLI binary (loads dist/src/cli.js)
  openclaw.invoke.js  # OpenClaw tool invocation binary
  clawd.invoke.js     # Clawd tool invocation binary
test/                 # ~40 test files, one per feature/command
  fixtures/           # Mock data for tests
```

## Key Patterns

- **ESM throughout**: All imports use `.js` extensions (TypeScript compiles to JS).
  When adding imports, always use `.js` extension even in `.ts` files.
- **Command interface**: Each stdlib command exports `{ name, help(), run(input, args, ctx) }`.
  Commands receive pipeline input, parsed args, and a context object with `env`, `mode`, `render`.
- **Context object**: Passed through the pipeline. Contains `env` (process.env or overrides),
  `stdin`/`stdout`/`stderr`, `mode` (tool|human), `render`, `registry`.
- **Tool mode vs human mode**: `--mode tool` emits JSON envelopes; human mode prints formatted text.
- **Approval flow**: Commands can return `{ requiresApproval: { prompt, items } }`.
  The CLI serializes state, emits a resume token, and exits. Resume continues from that point.
- **Workflow files**: YAML format with `name`, `args`, `steps`. Steps have `id`, `command`,
  optional `condition`, `on_fail`. Args are injected as `LOBSTER_ARG_<NAME>` env vars.
- **State**: JSON files in `LOBSTER_STATE_DIR` (default `.lobster/`). Used for run persistence,
  diff tracking, and resume tokens.

## Adding a New Stdlib Command

1. Create `src/commands/stdlib/<name>.ts` following the `{ name, help(), run() }` pattern.
2. Register it in `src/commands/registry.ts` — add import and append to the array.
3. Add a test in `test/<name>.test.ts`.
4. Build and run tests: `./scripts/test`.

## Adding a New SDK Primitive

1. Create `src/sdk/primitives/<name>.ts`.
2. Export it from `src/sdk/index.ts`.
3. Add tests in `test/`.

## Testing Patterns

- Tests use `node:test` (`describe`/`it`) and `node:assert`.
- Most tests create a context object with `env`, `stdin`, `stdout`, `stderr`, `registry`,
  `mode`, `render` — see any test file for the pattern.
- State-dependent tests create a temp `LOBSTER_STATE_DIR` and clean up after.
- CLI integration tests spawn `node bin/lobster.js` as a child process.
- No mocking library — tests use simple mock scripts (see `test/fixtures/mock-gog.mjs`).

## Workflow File Format

```yaml
name: my-workflow
args:
  param_name:
    description: "What this arg does"
    default: "fallback"
steps:
  - id: step1
    command: exec 'some shell command'
  - id: step2
    command: map 'another command'
    condition: "step1.output.someField == true"
    on_fail: skip
```

Args become `LOBSTER_ARG_<NAME>` env vars and `${param_name}` template substitutions in commands.
Subworkflows are supported — a step can reference another `.lobster` file.

## Gotchas

- **Build before test**: Tests run from `dist/`, not `src/`. If tests fail unexpectedly,
  rebuild first.
- **strict is off**: `tsconfig.json` has `strict: false` and `noImplicitAny: false`.
  Do not enable strict — existing code is not strict-compatible.
- **No declaration files**: `declaration: false` in tsconfig. The SDK exports JS + source maps.
- **Unused vars**: oxlint enforces `no-unused-vars` with `^_` ignore pattern.
  Prefix intentionally unused params with `_`.
- **LLM provider resolution**: Auto-detects from env vars in order:
  `LOBSTER_LLM_PROVIDER` > `LOBSTER_PI_LLM_ADAPTER_URL` > `LOBSTER_LLM_ADAPTER_URL`.
  If none set, llm.invoke throws.
- **Workflow depth limit**: Subworkflows nest up to `LOBSTER_MAX_WORKFLOW_DEPTH` (default 10).
- **Legacy env compat**: Some LLM env vars have legacy aliases (`LLM_TASK_*`).
  New code should use `LOBSTER_*` names only.
- **noEmitOnError**: tsconfig has `noEmitOnError: true`. Type errors block the build entirely.

## Files To Be Careful With

- `src/cli.ts` — large file, CLI entrypoint with many responsibilities.
- `src/workflows/file.ts` — complex YAML workflow executor with subworkflow support.
- `src/commands/stdlib/llm_invoke.ts` — LLM provider resolution, caching, schema validation.
- `src/commands/registry.ts` — changing registration order or names breaks CLI and workflows.
- `package.json` `exports` field — external consumers depend on these exact paths.

## Environment Variables

See `.env.example` for a full annotated list. Key ones:
- `LOBSTER_STATE_DIR` — where state files live
- `LOBSTER_LLM_PROVIDER` — which LLM backend to use
- `LOBSTER_MODE=tool` — force JSON envelope output
- `LOBSTER_SHELL` — override shell for exec commands
