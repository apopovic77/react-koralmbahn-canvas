#!/usr/bin/env bash
# Wrapper script for push-dev.sh

exec "$(dirname "$0")/.devops/scripts/push-dev.sh" "$@"
