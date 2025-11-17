# Agent Bootstrap Notes

1. **Repository context**
   - Project lives at `{{REPO_ROOT}}`.
   - Default working branch is `{{DEV_BRANCH}}`; production branch is `{{MAIN_BRANCH}}`.

2. **Git helper scripts** (under `.devops/scripts/` and already executable):
   - `checkout-branch.sh <{{DEV_BRANCH}}|{{MAIN_BRANCH}}>` – validate clean tree → fetch → checkout → fast-forward.
   - `push-dev.sh "commit message"` – checkout {{DEV_BRANCH}} → fast-forward from origin → stage all → commit → push `origin {{DEV_BRANCH}}`.
   - `build-local.sh [--clean]` – optional clean dist, run `{{BUILD_COMMAND}}`.
   - `release.sh [--no-build]` – sync & push {{DEV_BRANCH}}, optional local build, fast-forward {{MAIN_BRANCH}} from {{DEV_BRANCH}}, push {{MAIN_BRANCH}}, switch back to {{DEV_BRANCH}} (triggers GitHub Actions deploy).
   - `update-devops.sh [--starter-path <path>]` – optionally fetches `starter-devops` and re-applies the starter templates with `--update` using `.devops/starter-config.json`.

   Shortcuts: the repository root includes a dispatcher `./devops` so you can run `./devops checkout {{DEV_BRANCH}}`, `./devops push "msg"`, `./devops release`, or `./devops update` without remembering the full paths.

3. **Deployment pipeline**
   - GitHub Actions workflows are in `.github/workflows/`.
   - `dev.yml` runs on pushes to `{{DEV_BRANCH}}` or PRs targeting `{{MAIN_BRANCH}}`; it builds but does *not* deploy.
   - `deploy.yml` runs on pushes to `{{MAIN_BRANCH}}`; it builds and deploys via SSH using repo secrets (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PORT`).

4. **Deployment target**
   - Built files go to `{{DEPLOY_PATH}}`.
   - Backups are stored with prefix `{{BACKUP_PREFIX}}` under `/var/backups/` (configurable via templates).

5. **Startup checklist for new session**
   - `cd {{REPO_ROOT}}`.
   - `git status -sb` and note if tree is clean.
   - Use `.devops/scripts/checkout-branch.sh {{DEV_BRANCH}}` to sync branch (if tree clean).
   - When ready to release, follow: `.devops/scripts/push-dev.sh "msg"` → optional `build-local.sh` → `release.sh`.

6. **GitHub CLI**
   - Ensure `gh auth status` reports a logged-in user prior to running helper scripts that push.
   - After copying templates, add deployment secrets via `gh secret set`.

Read this file at session start so you remember the workflow.
