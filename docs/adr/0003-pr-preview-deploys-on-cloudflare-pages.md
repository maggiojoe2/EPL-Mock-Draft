# PR preview deploys via Cloudflare Pages Direct Upload, not GitHub Pages

Main already deploys to GitHub Pages via the Actions-based pipeline (`upload-pages-artifact` + `deploy-pages`), which replaces the entire site on every run and supports only one live deployment target. Getting concurrent, per-PR preview URLs on GitHub Pages would require an orphan-branch "merge store" (a persistent `gh-pages` branch acting as a folder tree, with every deploy — main or PR — checking out, patching its own subfolder, and re-uploading the whole tree) plus locking/retry logic to survive multiple PR workflows racing to push to that branch concurrently. That's real ongoing maintenance surface for a feature whose only job is throwaway preview links.

Chose Cloudflare Pages instead, in **Direct Upload** mode: PR builds still run in our own GitHub Actions (`npm ci && npm run build`, matching the existing `ci.yml`/`deploy.yml` pattern), then the built `dist/` is uploaded to Cloudflare via `wrangler`/`cloudflare/pages-action`. Main's `deploy.yml` is untouched. Each deployment gets a unique hash URL plus a stable per-branch alias URL that Cloudflare manages natively — no shared git state, no race conditions, concurrent previews are the default behavior rather than something to build.

Preview builds pass `base: "/"` (vs. main's hardcoded `/EPL-Mock-Draft/` in `vite.config.ts`) since each Cloudflare deployment lives at its own domain root, not a subpath of a shared site. This is the only build-time difference needed — confirmed only one `import.meta.env.BASE_URL`-relative fetch in the codebase (`useSetupState.ts`, for the bundled default CSVs), no other environment-specific config.

## Design

- **Trigger**: `pull_request` (`opened`, `synchronize`, `reopened`) targeting `main`, restricted to same-repo branches — fork PRs get a read-only token under this event and can't push a deploy without a riskier `pull_request_target` setup, which was out of scope.
- **Concurrency**: every open PR gets its own live preview simultaneously (native to Cloudflare, not something the workflow has to orchestrate).
- **URL naming**: Cloudflare's default deployment/branch-alias URLs are used as-is — no `--branch=pr-<N>` override for now. The branch-alias URL is already stable across pushes on a given branch, which is what preview links need.
- **PR comment**: one sticky comment per PR, edited in place on every push, showing the stable branch-alias preview URL, the current commit SHA, and deploy status (success/failure).
- **Cleanup**: on `pull_request: closed`, delete that PR's Cloudflare deployment.
- **CI relationship**: fully independent of `ci.yml` — preview deploys regardless of lint/test/typecheck status, since the preview's job is to let you look at the PR's UI, not gate on it.
- **Setup precondition**: a free Cloudflare account, a Pages project, and two GitHub repo secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) — human-only steps to be walked through via `/wizard` before implementation.

## Considered Options

- GitHub Pages via orphan-branch merge store — rejected for the ongoing complexity of merging concurrent deploys into one artifact and the race-condition risk of multiple PR workflows pushing to the same branch.
- Cloudflare Pages native Git integration (dashboard-connected, Cloudflare builds and comments automatically) — rejected in favor of Direct Upload via our own Actions: keeps the build matching the existing `ci.yml`/`deploy.yml` pattern, keeps build config in-repo instead of Cloudflare's dashboard, and isn't subject to the native-integration build-minute quota.
- `--branch=pr-<N>` override on deploy for a PR-number-based alias URL — deferred; the default branch-alias URL is already stable per-PR, and the override wasn't worth the added command complexity for this pass.
- Sticky comment posted once vs. edited per push — chose edited-per-push once status info (commit SHA, deploy success/failure) was added as a requirement; a single static comment can't reflect that.
