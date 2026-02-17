#!/bin/bash

# Setup and deploy to Vercel

echo "🚀 Starting Vercel setup and deployment..."

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js and npm first."
    exit 1
fi

# Ensure dependencies are installed
echo "📦 Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "   Installing dependencies..."
    npm install
else
    echo "   Dependencies already installed."
fi

# Verify build
echo "🏗️  Verifying build..."
if npm run build:all:pwa; then
  echo "✅ Build verification passed."
else
  echo "❌ Build failed. Please fix errors before deploying."
  exit 1
fi

# Deploy to Vercel
echo "☁️  Initializing Vercel deployment..."
echo "   You will be prompted to log in and link your project."
echo "   If asked 'Set up and deploy?', answer 'Y'."
echo "   IMPORTANT: Remember to set your Environment Variables in Vercel dashboard!"
echo "   (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, etc.)"

# Use npx vercel to avoid global installation requirement
npx vercel

echo "✨ Deployment process finished."
