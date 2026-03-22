# Personal Website Justfile

# Serve locally with python (no docker needed)
serve port="8080":
    python3 -m http.server {{port}}

# Build and start the Docker container
deploy:
    ./scripts/deploy.sh

# Stop the running container
stop:
    docker compose down

# Rebuild and restart (use after content changes)
redeploy:
    docker compose up --build -d

# View container logs
logs:
    docker compose logs -f

# Check container status
status:
    docker compose ps

# Run setup script and ensure git is installed
setup:
    #!/usr/bin/env bash
    set -euo pipefail

    # Check if git is installed
    if ! command -v git &> /dev/null; then
        echo "Error: git is not installed. Please install git first."
        exit 1
    fi
    echo "✓ Git is installed"

    # Run the setup script
    if [ -f "scripts/install-hooks.sh" ]; then
        echo "Running setup script..."
        ./scripts/install-hooks.sh
    else
        echo "Warning: Setup script scripts/install-hooks.sh not found"
        exit 1
    fi

# Commit changes to about.md and contact.md with minimal message
update:
    #!/usr/bin/env bash
    set -euo pipefail

    # Check if there are changes to about.md or contact.md
    if git diff --quiet content/about.md content/contact.md && git diff --cached --quiet content/about.md content/contact.md; then
        echo "No changes to about.md or contact.md to commit"
        exit 0
    fi

    # Add and commit changes
    git add content/about.md content/contact.md
    git commit -m "Update content"

# Enable auto-deploy cron (pulls and rebuilds on new commits every minute)
autodeploy-on:
    ./scripts/autodeploy.sh on

# Disable auto-deploy cron
autodeploy-off:
    ./scripts/autodeploy.sh off

# Check if auto-deploy cron is active
autodeploy-status:
    ./scripts/autodeploy.sh status

# Commit changes in posts folder with message of updated/added files
post:
    #!/usr/bin/env bash
    set -euo pipefail

    # Get untracked files in posts directory
    untracked_files=$(git ls-files --others --exclude-standard content/posts/ || echo "")

    # Check if there are changes in the posts directory (including untracked files)
    if git diff --quiet content/posts/ && git diff --cached --quiet content/posts/ && [ -z "$untracked_files" ]; then
        echo "No changes in posts folder to commit"
        exit 0
    fi

    # Get list of modified/added files in posts directory
    changed_files=$(git diff --name-only content/posts/ && git diff --cached --name-only content/posts/ && echo "$untracked_files" | sort | uniq)

    if [ -z "$changed_files" ]; then
        echo "No changes in posts folder to commit"
        exit 0
    fi

    # Create commit message from changed files
    commit_msg="Update posts: $(echo $changed_files | sed 's|content/posts/||g' | tr '\n' ' ' | sed 's/ $//')"

    # Add and commit changes
    git add content/posts/
    git commit -m "$commit_msg"