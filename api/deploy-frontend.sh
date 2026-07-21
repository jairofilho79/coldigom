#!/bin/bash
# Deploy frontend to Cloudflare Pages (conta jairofilho79)
# Usage: ./deploy-frontend.sh [project-name]
# Default project: coldigom-web

set -e
PROJECT="${1:-coldigom-web}"
ACCOUNT_ID="246ee6c20c011ae98a226d48a7a38902"
API_URL="https://coldigom-api.jairofilho79.workers.dev"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Building frontend (VITE_API_URL=$API_URL)..."
cd "$REPO_ROOT/web"
VITE_API_URL="$API_URL" npm run build

echo "Deploying to Pages project: $PROJECT"
CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" wrangler pages deploy dist --project-name="$PROJECT" --branch=main --commit-dirty=true

echo "Done."
