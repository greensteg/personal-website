#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/home/greensteg/personal-website"
CRON_JOB="* * * * * $REPO_DIR/scripts/autodeploy.sh run"
CRON_PATTERN="autodeploy.sh run"

usage() {
    echo "Usage: $0 {on|off|status|run}"
    exit 1
}

case "${1:-}" in
    run)
        cd "$REPO_DIR"
        git fetch origin main
        if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
            git pull
            docker compose up -d --build
        fi
        ;;
    on)
        ( (crontab -l 2>/dev/null || true) | (grep -v "$CRON_PATTERN" || true); echo "$CRON_JOB") | crontab -
        echo "Auto-deploy cron enabled (checks every minute)"
        ;;
    off)
        (crontab -l 2>/dev/null || true) | (grep -v "$CRON_PATTERN" || true) | crontab -
        echo "Auto-deploy cron disabled"
        ;;
    status)
        if crontab -l 2>/dev/null | grep -q "$CRON_PATTERN"; then
            echo "Auto-deploy: ENABLED"
            crontab -l | grep "$CRON_PATTERN"
        else
            echo "Auto-deploy: DISABLED"
        fi
        ;;
    *)
        usage
        ;;
esac
