# Develop on `dev`, release `main` by merge, version by git tag

`store-backend` and `store-frontend` take all work on a `dev` branch (the default branch). `main` is only changed by a merge-commit PR from `dev` once its checks are green, and every merge to `main` publishes `sha-<commit>` images. A release is a manual **Release** workflow run on `main` that creates a SemVer `vX.Y.Z` git tag (backend and frontend versioned independently), a GitHub release, and the tag's image. The git tag is the only source of truth for a version; `pyproject.toml` and `package.json` are not kept in sync.

Rulesets enforce this: `main` and `dev` both need a PR with passing checks and block force-push and deletion; `dev` takes squash merges, `main` takes merge commits; there is no bypass. `store-infra` has a `main` ruleset only (the `smoke` e2e check).

## Considered options

- **Automated versions (release-please from Conventional Commits).** Rejected: history does not use Conventional Commits, and one person tags rarely. Revisit if changelogs become wanted.
- **Auto-opening the `dev` to `main` PR.** Rejected: it needs the repo setting that lets GitHub Actions create and approve PRs. The PR is opened by hand instead.
- **Required "up to date" check on `main`.** Off: `main` takes merge commits, so it is always one commit ahead of `dev`, and the check would force a back-merge before every release. The checks already run on `dev`'s head commit.
