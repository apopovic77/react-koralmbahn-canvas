# Helper Scripts

The following helper scripts live in `.devops/scripts/` and automate the local release workflow:

- `checkout-branch.sh <{{DEV_BRANCH}}|{{MAIN_BRANCH}}>` – Checks for a clean working tree, fetches from `origin`, and checks out the requested branch.
- `push-dev.sh "commit message"` – Switches to `{{DEV_BRANCH}}`, fast-forwards from `origin`, stages all changes, commits with the given message, and pushes to `origin {{DEV_BRANCH}}`.
- `build-local.sh [--clean]` – Runs `{{BUILD_COMMAND}}` in the repo (optional `dist/` cleanup first) for a production build smoke test.
- `release.sh [--no-build]` – Synchronises `{{DEV_BRANCH}}`, pushes it, optionally runs a local build, fast-forwards `{{MAIN_BRANCH}}` from `{{DEV_BRANCH}}`, pushes `{{MAIN_BRANCH}}`, and switches back to `{{DEV_BRANCH}}`. Pushing `{{MAIN_BRANCH}}` triggers the GitHub Actions deploy.
- `update-devops.sh [--starter-path <path>]` – Optionally fetches `starter-devops` and reruns the starter templates with `--update` so `.devops/` and `.github/workflows/` stay current.

After copying the scripts into a project run `chmod +x .devops/scripts/*.sh` if your Git checkout does not preserve executable bits.

Shortcuts: the repository root includes a `./devops` helper. Example calls:

```bash
./devops checkout {{DEV_BRANCH}}
./devops push "feat: add new helmet grid"
./devops release
./devops update
```
