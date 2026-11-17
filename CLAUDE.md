## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (`serkanbulutgenc/store-infra`) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Git workflow

`store-backend` and `store-frontend` develop on `dev` and release `main` by merge, versioned by git tag (see `docs/adr/0001-dev-branch-and-tag-versioning.md` and the runbook). This repo has no `dev`: branch from `main` and open a PR into `main`; the `smoke` e2e check is required and `main` is protected.
