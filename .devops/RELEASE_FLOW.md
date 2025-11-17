# 🚀 Release Flow Overview

## Branches
- **`{{DEV_BRANCH}}`** – Integration branch for day-to-day work.
- **`{{MAIN_BRANCH}}`** – Production branch; pushing here triggers the deployment workflow.

## Typical Release Steps
1. Develop features on short-lived branches branched off `{{DEV_BRANCH}}`.
2. Merge into `{{DEV_BRANCH}}` via pull request. CI (`dev.yml`) runs automatically.
3. When ready to ship, ensure `{{DEV_BRANCH}}` is green and run `.devops/scripts/release.sh`.
4. The script fast-forwards `{{MAIN_BRANCH}}`, pushes to GitHub, and GitHub Actions (`deploy.yml`) handles build + deploy.
5. Monitor the workflow run with `gh run watch` or via the Actions tab.
6. Validate the site at `{{SITE_URL}}` (if applicable) and confirm fresh assets reached `{{DEPLOY_PATH}}`.

## Rollback Strategy
- Use `.devops/rollback.sh` on the server to restore from `/var/backups/{{BACKUP_PREFIX}}-*`.
- Alternatively revert the offending commit on `{{MAIN_BRANCH}}` and push to trigger a redeploy.
