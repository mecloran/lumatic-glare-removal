# CLAUDE.md (repo-local configuration for Claude Code)

## Project quickstart (non-interactive)
- Install deps: `pnpm install --frozen-lockfile` (or `npm ci` / `yarn install` / `bun install`)
- Type check: `pnpm typecheck || echo "no typecheck"`
- Lint: `pnpm lint --max-warnings=0 || echo "no lint"`
- Test: `pnpm test --run --reporter=dot || echo "no tests"`
- Build: `pnpm build || echo "no build"`

## Command execution policy (timeouts & backgrounding)
- Use the `tools/safe-run.sh` wrapper for commands that may hang or run long:
  - With timeout: `bash tools/safe-run.sh -t 300 <command>`
  - Background: `bash tools/safe-run.sh -b dev <command>`
  - Stop background: `bash tools/safe-run.sh -k dev`
  - Check status: `bash tools/safe-run.sh -s dev`
  - View logs: `bash tools/safe-run.sh -l dev`
- Prefer non-interactive flags (`--yes`, `--ci`, `--no-daemon`, `-y`) to avoid TTY prompts.
- For direct timeout usage:
  - macOS: `gtimeout 300s <command>` (install via: `brew install coreutils`)
  - Linux/WSL: `timeout 300s <command>`

## Port policy (global registry to avoid collisions)
- Ports are managed via a **global registry** at `~/.code_projects/port_registry.json`
- Local copies are stored in `.claude/ports.json` and `.claude/port` for convenience
- Use `tools/port.sh` to retrieve ports: `$(bash tools/port.sh app)` or `$(bash tools/port.sh api)`
- The registry ensures no two projects share the same port, even when only one is running
- To view all project ports: `cat ~/.code_projects/port_registry.json`
- To regenerate the HTML launcher: `python3 ~/.code_projects/update_project_launcher.py`
- View launcher at: `~/all_code_projects.html`

## Snapshot / screenshot verification
- To verify UI changes:
  `node scripts/serve-and-snap.mjs --port $(bash tools/port.sh app) --url http://localhost:$(bash tools/port.sh app) --cmd "PORT=$(bash tools/port.sh app) pnpm dev"`

## Visual testing
- After basic tests pass, projects should have a visual testing script in place.
- The visual testing script should generate a report displaying each screenshot with two review sections:
  - **ERRORS:** Any functional errors, broken layouts, missing elements, or rendering issues observed in the screenshot.
  - **DESIGN:** Design issues where the UI may not meet the user's requirements, or suggestions based on design principles (spacing, alignment, color contrast, typography, etc.).
- Run visual testing: `node scripts/visual-test.mjs --port $(bash tools/port.sh app)`
- After visual testing completes, leave the dev server running so the user can manually test at `http://localhost:$(bash tools/port.sh app)`.
- Do NOT stop the server after visual testing; the user should be able to interact with the application themselves.

## Monorepo conventions
- If working in `packages/<name>/`, prefer `packages/<name>/CLAUDE.md`. Nearest file wins.
- Root CLAUDE.md applies to all packages unless overridden.

## Memory and context
- For project-specific instructions that should persist, add them to this file.
- For user-specific global settings, use `~/.claude/settings.json`.
- Use `/memory` to save frequently needed information across sessions.

## Allowed and disallowed operations
- Do NOT edit files outside the workspace directory.
- Do NOT move, rename, or delete `.env`, secrets, or credential files.
- Do NOT run `npm upgrade`, `pnpm up`, or other package upgrades unless explicitly requested.
- Do NOT commit or push changes without explicit user approval.
- Do NOT expose secrets in logs, screenshots, or output.

## Vercel Deployment
When the user asks to deploy to Vercel, use the `tools/vercel_deploy.sh` script:

```bash
bash tools/vercel_deploy.sh -m "Your commit message"
```

**Prerequisites:**
- The `VERCEL_TOKEN` environment variable must be set (for non-interactive deployments)
- The project must be linked to Vercel (`vercel link` has been run)

**Options:**
- `-m "message"` - Commit message (required if there are uncommitted changes)
- `--skip-commit` - Skip git commit, just push and deploy
- `--skip-checks` - Skip local type-check and lint verification
- `--preview` - Deploy to preview instead of production

**IMPORTANT: Error Handling Protocol**
1. Run the deploy script and capture its output
2. Check for `DEPLOY_STATUS: FAILED` in the output
3. If failed, look for error sections marked with:
   - `=== TYPESCRIPT ERRORS ===`
   - `=== ESLINT ERRORS ===`
   - `=== API SYNTAX ERROR ===`
   - `=== VERCEL BUILD ERRORS ===`
   - `=== GIT PUSH ERROR ===`
   - `=== UNCOMMITTED CHANGES ===`
4. **Fix the errors** in the relevant files
5. **Run the deploy script again**
6. Repeat until `DEPLOY_STATUS: SUCCESS` is returned
7. Only report success to the user after seeing `DEPLOY_STATUS: SUCCESS`

**Do NOT** tell the user the deploy succeeded until you have confirmed `DEPLOY_STATUS: SUCCESS` in the output. Always fix errors and retry automatically.

## Error handling
- If a command fails, immediately diagnose the problem, fix it and try again - only engage the user after repeated failures.
- If tests fail, run them individually to isolate the failure and immediately fix the failed test issues.
- If type checking fails, fix type errors before proceeding with other changes.

## Code style preferences
- Follow existing project conventions (indentation, quotes, semicolons).
- Prefer explicit types over `any` in TypeScript.
- Write self-documenting code; add comments only for non-obvious logic.

## Testing expectations
- Run tests after making changes: `pnpm test`
- Ensure all tests pass before considering a task complete.
- Add tests for new functionality when appropriate.

## Project registration
When the user creates a new project or asks you to modify the project details, you can run the below commands yourself.
This project is registered in the global code projects registry. To update:
- Modify description: `update_claude_code.sh --description "New description" --force .`
- Reallocate ports: `update_claude_code.sh --force .`
- Unregister: `update_claude_code.sh --unregister .`
