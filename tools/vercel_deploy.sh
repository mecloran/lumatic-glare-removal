#!/bin/bash
# Vercel Deploy Script
# Returns exit code 0 on success, 1 on failure
# Outputs errors clearly for Claude to parse and fix

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
COMMIT_MSG=""
SKIP_COMMIT=false
SKIP_CHECKS=false
PRODUCTION=true

while [[ $# -gt 0 ]]; do
  case $1 in
    -m|--message)
      COMMIT_MSG="$2"
      shift 2
      ;;
    --skip-commit)
      SKIP_COMMIT=true
      shift
      ;;
    --skip-checks)
      SKIP_CHECKS=true
      shift
      ;;
    --preview)
      PRODUCTION=false
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  -m, --message MSG   Commit message (required if there are changes)"
      echo "  --skip-commit       Skip git commit, just push and deploy"
      echo "  --skip-checks       Skip local type-check and build verification"
      echo "  --preview           Deploy to preview instead of production"
      echo "  -h, --help          Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)
PROJECT_NAME=$(basename "$PROJECT_ROOT")

echo "=== Vercel Deploy Script ==="
echo "Project: ${PROJECT_ROOT}"

# Pre-deploy checks
if ! $SKIP_CHECKS; then
  echo ""
  echo "=== Running pre-deploy checks ==="

  # Check for frontend directory (monorepo structure)
  if [ -d "frontend" ]; then
    cd frontend

    # TypeScript check
    if [ -f "tsconfig.json" ]; then
      echo "Checking TypeScript..."
      TSC_OUTPUT=$(pnpm tsc --noEmit 2>&1)
      TSC_EXIT=$?
      if [ $TSC_EXIT -ne 0 ]; then
        echo ""
        echo "=== TYPESCRIPT ERRORS ==="
        echo "$TSC_OUTPUT"
        echo "=== END TYPESCRIPT ERRORS ==="
        echo ""
        echo "DEPLOY_STATUS: FAILED"
        echo "FAILURE_REASON: TypeScript errors"
        exit 1
      fi
      echo "✓ TypeScript OK"
    fi

    # ESLint check
    if [ -f ".eslintrc.json" ] || [ -f ".eslintrc.js" ] || [ -f "eslint.config.js" ]; then
      echo "Checking ESLint..."
      LINT_OUTPUT=$(pnpm lint 2>&1)
      LINT_EXIT=$?
      if [ $LINT_EXIT -ne 0 ]; then
        echo ""
        echo "=== ESLINT ERRORS ==="
        echo "$LINT_OUTPUT"
        echo "=== END ESLINT ERRORS ==="
        echo ""
        echo "DEPLOY_STATUS: FAILED"
        echo "FAILURE_REASON: ESLint errors"
        exit 1
      fi
      echo "✓ ESLint OK"
    fi

    cd "$PROJECT_ROOT"
  else
    # Root-level project (not monorepo)
    if [ -f "tsconfig.json" ]; then
      echo "Checking TypeScript..."
      TSC_OUTPUT=$(pnpm tsc --noEmit 2>&1)
      TSC_EXIT=$?
      if [ $TSC_EXIT -ne 0 ]; then
        echo ""
        echo "=== TYPESCRIPT ERRORS ==="
        echo "$TSC_OUTPUT"
        echo "=== END TYPESCRIPT ERRORS ==="
        echo ""
        echo "DEPLOY_STATUS: FAILED"
        echo "FAILURE_REASON: TypeScript errors"
        exit 1
      fi
      echo "✓ TypeScript OK"
    fi

    # ESLint check
    if [ -f ".eslintrc.json" ] || [ -f ".eslintrc.js" ] || [ -f "eslint.config.js" ]; then
      echo "Checking ESLint..."
      LINT_OUTPUT=$(pnpm lint 2>&1)
      LINT_EXIT=$?
      if [ $LINT_EXIT -ne 0 ]; then
        echo ""
        echo "=== ESLINT ERRORS ==="
        echo "$LINT_OUTPUT"
        echo "=== END ESLINT ERRORS ==="
        echo ""
        echo "DEPLOY_STATUS: FAILED"
        echo "FAILURE_REASON: ESLint errors"
        exit 1
      fi
      echo "✓ ESLint OK"
    fi
  fi

  # Check API files syntax (for Vercel serverless functions)
  if [ -d "api" ]; then
    echo "Checking API syntax..."
    for f in api/*.js api/**/*.js 2>/dev/null; do
      if [ -f "$f" ]; then
        SYNTAX_OUTPUT=$(node --check "$f" 2>&1)
        if [ $? -ne 0 ]; then
          echo ""
          echo "=== API SYNTAX ERROR ==="
          echo "File: $f"
          echo "$SYNTAX_OUTPUT"
          echo "=== END API SYNTAX ERROR ==="
          echo ""
          echo "DEPLOY_STATUS: FAILED"
          echo "FAILURE_REASON: API syntax error in $f"
          exit 1
        fi
      fi
    done
    echo "✓ API syntax OK"
  fi

  echo "=== Pre-deploy checks passed ==="
fi

# Check for uncommitted changes
if ! $SKIP_COMMIT; then
  CHANGES=$(git status --porcelain)
  if [ -n "$CHANGES" ]; then
    if [ -z "$COMMIT_MSG" ]; then
      echo ""
      echo "=== UNCOMMITTED CHANGES ==="
      git status --short
      echo "=== END UNCOMMITTED CHANGES ==="
      echo ""
      echo "DEPLOY_STATUS: FAILED"
      echo "FAILURE_REASON: Uncommitted changes without commit message. Use -m 'message' or --skip-commit"
      exit 1
    fi

    echo ""
    echo "Staging and committing changes..."
    git add -A
    git commit -m "$COMMIT_MSG

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
    echo "✓ Changes committed"
  else
    echo "No changes to commit"
  fi
fi

# Push to GitHub
echo ""
echo "Pushing to GitHub..."
unset GH_TOKEN 2>/dev/null || true
PUSH_OUTPUT=$(git push 2>&1)
PUSH_EXIT=$?
if [ $PUSH_EXIT -ne 0 ]; then
  echo ""
  echo "=== GIT PUSH ERROR ==="
  echo "$PUSH_OUTPUT"
  echo "=== END GIT PUSH ERROR ==="
  echo ""
  echo "DEPLOY_STATUS: FAILED"
  echo "FAILURE_REASON: Git push failed"
  exit 1
fi
echo "✓ Pushed to GitHub"

# Deploy to Vercel
echo ""
if $PRODUCTION; then
  echo "Deploying to Vercel (production)..."
  VERCEL_CMD="vercel --prod --yes"
else
  echo "Deploying to Vercel (preview)..."
  VERCEL_CMD="vercel --yes"
fi

# Capture Vercel output
VERCEL_OUTPUT=$($VERCEL_CMD 2>&1)
VERCEL_EXIT=$?

if [ $VERCEL_EXIT -ne 0 ]; then
  echo ""
  echo "=== VERCEL BUILD ERRORS ==="
  echo "$VERCEL_OUTPUT"
  echo "=== END VERCEL BUILD ERRORS ==="
  echo ""
  echo "DEPLOY_STATUS: FAILED"
  echo "FAILURE_REASON: Vercel build/deploy failed"
  exit 1
fi

# Check for build errors in output even if exit code is 0
if echo "$VERCEL_OUTPUT" | grep -qiE "error TS|Build failed|error:"; then
  echo ""
  echo "=== VERCEL BUILD ERRORS ==="
  echo "$VERCEL_OUTPUT"
  echo "=== END VERCEL BUILD ERRORS ==="
  echo ""
  echo "DEPLOY_STATUS: FAILED"
  echo "FAILURE_REASON: Vercel build had errors"
  exit 1
fi

echo "$VERCEL_OUTPUT"
echo ""
echo "=== Deploy Complete ==="

# Extract and display the deployed URL from Vercel output
DEPLOYED_URL=$(echo "$VERCEL_OUTPUT" | grep -oE 'https://[^ ]+\.vercel\.app' | tail -1)
if [ -n "$DEPLOYED_URL" ]; then
  echo "Deployed URL: $DEPLOYED_URL"
fi

echo ""
echo "DEPLOY_STATUS: SUCCESS"
exit 0
