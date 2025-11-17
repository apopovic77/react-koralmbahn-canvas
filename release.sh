#!/usr/bin/env bash
# Wrapper script for release.sh

exec "$(dirname "$0")/.devops/scripts/release.sh" "$@"
