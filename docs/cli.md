# CLI Guide

OntoMCP ships with a CLI entrypoint that supports server startup and ontology linting.

## Commands

### `ontomcp`

Defaults to `start` mode and runs the MCP server on stdio.

### `ontomcp start`

Explicit start mode (same behavior as `ontomcp`).

### `ontomcp lint <ontologyDir> [--fail-on-warnings|--fail-on-warnings=true|--fail-on-warnings=false]`

Runs ontology lint checks with warning sources from:

- ontology ingest warnings
- compiler warnings across all root entities

When fail-on-warnings is enabled, the command exits with code `1` if warnings are found.

Unknown options (for example `--bad-flag`) fail with exit code `2` and print an explicit `Unknown option: ...` message.
`--help` short-circuits lint argument parsing and always prints usage, even when combined with other lint arguments.

## Exit Codes

- `0`: success
- `1`: runtime failure, or warnings found while `--fail-on-warnings` is enabled
- `2`: CLI usage error

## Error Output Behavior

- Fatal lint failures are shown as concise messages by default:
  - `Lint failed: <message>`
- Stacktraces are hidden by default.
- Set `ONTOMCP_DEBUG=1` to include stacktraces for troubleshooting.

## Color Output

- PASS/FAIL status is colorized automatically in interactive terminals (TTY).
- In non-interactive environments (for example CI), output stays plain text.
- `NO_COLOR=1` disables color output.

## Local Examples

```bash
# Start MCP server
ontomcp

# Lint and report warnings (non-failing)
ontomcp lint /absolute/path/to/ontology-pack

# Lint and fail on warnings (CI gate)
ontomcp lint /absolute/path/to/ontology-pack --fail-on-warnings

# Explicit boolean flag forms
ontomcp lint /absolute/path/to/ontology-pack --fail-on-warnings=true
ontomcp lint /absolute/path/to/ontology-pack --fail-on-warnings=false

# Help can be requested with or without additional lint args
ontomcp lint --help
ontomcp lint /absolute/path/to/ontology-pack --help
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
