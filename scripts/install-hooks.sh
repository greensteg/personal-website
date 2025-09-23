#!/bin/bash

# Installation script for git hooks
# This script copies all hooks from scripts/hooks/ to .git/hooks/ and makes them executable

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_SOURCE_DIR="$SCRIPT_DIR/hooks"
HOOKS_TARGET_DIR=".git/hooks"

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "Error: This script must be run from the root of a git repository"
    exit 1
fi

# Check if hooks source directory exists
if [ ! -d "$HOOKS_SOURCE_DIR" ]; then
    echo "Error: Hooks source directory '$HOOKS_SOURCE_DIR' not found"
    exit 1
fi

# Create target directory if it doesn't exist
mkdir -p "$HOOKS_TARGET_DIR"

echo "Installing git hooks..."

# Copy all hook files from source to target
hook_count=0
for hook_file in "$HOOKS_SOURCE_DIR"/*; do
    if [ -f "$hook_file" ]; then
        hook_name=$(basename "$hook_file")
        target_file="$HOOKS_TARGET_DIR/$hook_name"

        echo "  Installing $hook_name"
        cp "$hook_file" "$target_file"
        chmod +x "$target_file"

        ((hook_count++))
    fi
done

if [ $hook_count -eq 0 ]; then
    echo "No hooks found in $HOOKS_SOURCE_DIR"
else
    echo "Successfully installed $hook_count git hook(s)"
    echo ""
    echo "Installed hooks:"
    ls -la "$HOOKS_TARGET_DIR" | grep -v "\.sample$" | grep -v "^total" | grep -v "^d"
fi

echo ""
echo "Git hooks installation complete!"