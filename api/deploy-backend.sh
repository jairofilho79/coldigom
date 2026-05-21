#!/bin/bash
# Deploy backend to Cloudflare Workers
# Run this in your terminal where wrangler is authenticated
# Usage: ./deploy-backend.sh

echo "=========================================="
echo "Backend Deployment Script"
echo "=========================================="
echo ""

cd api || exit 1

echo "Building TypeScript..."
npm run build 2>/dev/null || npx tsc

echo ""
echo "Deploying to Cloudflare Workers..."
wrangler deploy

echo ""
echo "Deployment complete!"
