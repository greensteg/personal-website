#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/home/greensteg/personal-website"
STATE_FILE="$REPO_DIR/.git/autodeploy-deployed"
CRON_JOB="* * * * * $REPO_DIR/scripts/autodeploy.sh run"
CRON_PATTERN="personal-website.*autodeploy.sh run|autodeploy.sh run|git fetch origin main"

usage() {
    echo "Usage: $0 {on|off|status|run}"
    exit 1
}

case "${1:-}" in
    run)
        cd "$REPO_DIR"
        git fetch origin main

        remote_sha="$(git rev-parse origin/main)"
        deployed_sha=""
        if [ -f "$STATE_FILE" ]; then
            deployed_sha="$(cat "$STATE_FILE")"
        fi

        if [ "$(git rev-parse HEAD)" != "$remote_sha" ]; then
            git pull --ff-only origin main
        fi

        if [ "$deployed_sha" != "$remote_sha" ]; then
            docker compose up -d --build
            printf '%s\n' "$remote_sha" > "$STATE_FILE"
        fi
        ;;
    on)
        ( (crontab -l 2>/dev/null || true) | (grep -Ev "$CRON_PATTERN" || true); echo "$CRON_JOB") | crontab -
        echo "Auto-deploy cron enabled (checks every minute)"
        ;;
    off)
        (crontab -l 2>/dev/null || true) | (grep -Ev "$CRON_PATTERN" || true) | crontab -
        echo "Auto-deploy cron disabled"
        ;;
    status)
        if crontab -l 2>/dev/null | grep -Eq "$CRON_PATTERN"; then
            echo "Auto-deploy: ENABLED"
            crontab -l | grep -E "$CRON_PATTERN"
        else
            echo "Auto-deploy: DISABLED"
        fi
        ;;
    *)
        usage
        ;;
esac
