# Maintainer Operations

## Recommended GitHub repository settings

1. Enable branch protection for `main`:
   - require pull request before merge
   - require status checks to pass (`CI`)
   - dismiss stale approvals when new commits are pushed
   - disallow force-push
2. Enable discussions for user support.
3. Enable Dependabot alerts and updates.
4. Enable secret scanning.

## Release process

1. Update `CHANGELOG.md`.
2. Bump version in `package.json`.
3. Create and push a git tag.
4. Publish GitHub Release notes.
