#!/bin/bash
# Git commit commands for Lagos timezone implementation

# Stage all changes
git add -A

# Commit with the message
git commit -F COMMIT_READY.txt

# Or use this one-liner:
# git commit -m "feat: Implement Lagos timezone enforcement and optimize database queries" -m "See COMMIT_READY.txt for full details"

echo "✅ Commit created successfully!"
echo "📝 Review the commit with: git log -1"
echo "🚀 Push with: git push"
