# OntoMCP Maintainer Operations

## Repository baseline settings

Apply these defaults in GitHub repository settings:

- Default branch: `main`
- Allow auto-merge: enabled
- Automatically delete head branches: enabled
- Merge method: squash merge only
- Disable merge commits and rebase merges
- Require signed commits (recommended)

## Branch protection for `main`

Use a branch protection rule (or ruleset) for `main` with:

- Require a pull request before merging
- Require at least 1 approving review
- Require CODEOWNERS review
- Dismiss stale approvals when new commits are pushed
- Require status checks to pass before merging
- Require branches to be up to date before merging
- Block direct pushes to `main` (except admins only if emergency policy requires it)

## Required status checks

Keep these checks required for merge:

- Typecheck
- Build
- Test (Node 20, Node 22 matrix)
- Coverage

These checks are enforced by `.github/workflows/ci.yml`.

## PR quality gate

Before merge, ensure every PR includes:

- Clear summary and problem statement
- Linked issue (if applicable)
- Test evidence (`npm test`, `npm run typecheck`, `npm run test:coverage`)
- Documentation updates when behavior changes

The default PR template is in `.github/pull_request_template.md`.
