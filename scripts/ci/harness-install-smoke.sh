#!/usr/bin/env bash
#
# Harness install smoke test (plan §53.4, §56 — Milestone 1 acceptance,
# re-verified every Milestone 7 CI run).
#
# Builds nothing itself: it consumes the most recent `dsh-linear-*.tgz` in
# the repo root (produced by `pnpm pack` / `vp pack`), installs it into a
# throwaway `DSH_HOME` profile with the real `dsh` CLI, and asserts:
#
#   1. `dsh plugin --profile smoke add <tgz>` installs and mounts the bundle
#      (the `cordis.patch.yml` insert lands in the composed profile),
#   2. the installed package loads in Node and exports the full 11-tool
#      catalog the model depends on (plan §76).
#
# A full Harness boot with tools visible in a live session is exercised
# against the local profile in Development; CI keeps this deterministic
# import-level smoke per plan §53.4.
#
# Usage:  bash scripts/ci/harness-install-smoke.sh
# Env:    DSH            dsh CLI binary (default: `dsh`)
#         DSH_VERSION    version to resolve via `npx` when `dsh` is absent
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TGZ="$(ls -t "$ROOT"/dsh-linear-*.tgz 2>/dev/null | head -1 || true)"
if [[ -z "${TGZ:-}" ]]; then
  echo "error: no dsh-linear-*.tgz in $ROOT — run \`pnpm pack\` first" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export DSH_HOME="$TMP"

# Resolve the dsh CLI: prefer $DSH, fall back to the pinned wave via npx.
if [[ -n "${DSH:-}" && -x "$(command -v "$DSH")" ]]; then
  DSH_BIN="$DSH"
else
  DSH_BIN="$(command -v dsh || true)"
fi
if [[ -z "${DSH_BIN:-}" ]]; then
  DSH_BIN="npx --yes @deepseek-ai/dsh@${DSH_VERSION:-0.1.0-rc.6}"
fi

echo "==> installing $TGZ into fresh profile (DSH_HOME=$DSH_HOME)"
"$DSH_BIN" plugin --profile smoke add "$TGZ"

echo "==> asserting the bundle patch mounted the linear plugin row"
"$DSH_BIN" --profile smoke --dump-config >"$TMP/config.yml"
grep -q "dsh-linear" "$TMP/config.yml"

echo "==> asserting the installed package loads and exports the 11 tools"
(
  cd "$DSH_HOME/profiles/smoke"
  node --input-type=module -e '
    import { apply, inject, linearTools } from "dsh-linear";
    if (typeof apply !== "function") throw new Error("apply is not a function");
    if (!inject.includes("tools")) throw new Error("tools inject missing");
    const names = linearTools.map((t) => t.name).sort();
    const expected = [
      "linear_add_comment",
      "linear_connection_status",
      "linear_create_issue",
      "linear_get_issue",
      "linear_get_issue_context",
      "linear_get_project",
      "linear_list_cycles",
      "linear_list_projects",
      "linear_list_teams",
      "linear_search_issues",
      "linear_update_issue",
    ];
    if (JSON.stringify(names) !== JSON.stringify(expected)) {
      throw new Error("tool catalog mismatch: " + JSON.stringify(names));
    }
    console.log("ok: plugin loads, tools =", names.length);
  '
)

echo "==> harness install smoke passed"
