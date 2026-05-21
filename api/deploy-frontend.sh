#!/bin/bash
# Deploy frontend to Cloudflare Pages
# Run this in your terminal where wrangler is authenticated
# Usage: ./deploy-frontend.sh

echo "=========================================="
echo "Frontend Deployment Script"
echo "=========================================="
echo ""

cd web || exit 1

echo "Building frontend..."
npm run build

echo ""
echo "Deploying to Cloudflare Pages..."
wrangler pages deploy dist

echo ""
echo "Deployment complete!"
