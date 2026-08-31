#!/usr/bin/env bash
# Capability-local entry point for the canonical safe logger.
set -euo pipefail

skill_root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd -P)
exec "$skill_root/scripts/log.sh" "$@"
