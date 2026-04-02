# CLI Guide

OntoMCP ships with a CLI entrypoint that supports server startup and ontology linting.

## Commands

### `ontomcp`

Defaults to `start` mode and runs the MCP server on stdio.

### `ontomcp start`

Explicit start mode (same behavior as `ontomcp`).

### `ontomcp lint <ontologyDir> [--fail-on-warnings]`

Runs ontology lint checks with warning sources from:

- ontology ingest warnings
- compiler warnings across all root entities

When `--fail-on-warnings` is provided, the command exits with code `1` if warnings are found.

## Exit Codes

- `0`: success
- `1`: runtime failure, or warnings found while `--fail-on-warnings` is enabled
- `2`: CLI usage error

## Local Examples

```bash
# Start MCP server
ontomcp

# Lint and report warnings (non-failing)
ontomcp lint /absolute/path/to/ontology-pack

# Lint and fail on warnings (CI gate)
ontomcp lint /absolute/path/to/ontology-pack --fail-on-warnings
```

## GitHub Actions Example

```yaml
- name: Build OntoMCP
  run: npm run build

- name: Ontology lint
  run: node dist/cli.js lint /absolute/path/to/ontology-pack --fail-on-warnings
```

## Pre-Commit Example

```bash
#!/usr/bin/env bash
set -euo pipefail

node dist/cli.js lint /absolute/path/to/ontology-pack --fail-on-warnings
```
