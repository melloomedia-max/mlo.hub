#!/bin/bash
# Quick deployment script for mlo.hub to Railway

set -e

echo "🚀 Deploying mlo.hub to Railway..."
echo ""

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Install it first:"
    echo "   npm install -g @railway/cli"
    echo "   railway login"
    exit 1
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "❌ Not logged into Railway. Run: railway login"
    exit 1
fi

# Show current status
echo "📊 Current status:"
git status --short
echo ""

# Confirm deployment
read -p "Deploy to Railway? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

# Deploy
echo ""
echo "🚢 Deploying..."
railway up

echo ""
echo "✅ Deployment triggered!"
echo ""
echo "Monitor deployment:"
echo "  https://railway.app"
echo ""
echo "Check logs:"
echo "  railway logs"
echo ""
