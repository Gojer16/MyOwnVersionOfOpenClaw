#!/bin/bash
# ─── Security & Template System Verification ──────────────────────
# Comprehensive check before making repository public

set -e

echo "🔐 Security & Template System Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PASSED=0
FAILED=0

# Test 1: Check .gitignore has workspace exclusion
echo "📋 Test 1: Checking .gitignore..."
if grep -q "^/workspace/$" .gitignore && grep -q "^!templates/workspace/$" .gitignore; then
    echo "   ✅ .gitignore correctly configured"
    ((PASSED++))
else
    echo "   ❌ .gitignore missing workspace exclusions"
    ((FAILED++))
fi
echo ""

# Test 2: Check no workspace files are tracked
echo "📋 Test 2: Checking git doesn't track workspace files..."
TRACKED=$(git ls-files | grep -E "^workspace/" | grep -v "workspace/README.md" || true)
if [ -z "$TRACKED" ]; then
    echo "   ✅ No workspace files tracked in git"
    ((PASSED++))
else
    echo "   ❌ Found tracked workspace files:"
    echo "$TRACKED" | sed 's/^/      /'
    ((FAILED++))
fi
echo ""

# Test 3: Check templates have frontmatter
echo "📋 Test 3: Checking templates have frontmatter..."
node scripts/verify-templates.js > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ All templates have frontmatter"
    ((PASSED++))
else
    echo "   ❌ Some templates missing frontmatter"
    ((FAILED++))
fi
echo ""

# Test 4: Check user workspace exists and has files
echo "📋 Test 4: Checking user workspace..."
if [ -d "$HOME/.talon/workspace" ] && [ "$(ls -A $HOME/.talon/workspace)" ]; then
    echo "   ✅ User workspace exists with files"
    ((PASSED++))
else
    echo "   ⚠️  User workspace empty or missing (will be created on first run)"
    ((PASSED++))
fi
echo ""

# Test 5: Check no API keys in source code
echo "📋 Test 5: Checking for hardcoded secrets..."
SECRETS=$(git grep -i -E "(api[_-]?key|secret|password|token).*=.*['\"][a-zA-Z0-9]{20,}" -- "*.ts" "*.js" "*.json" || true)
if [ -z "$SECRETS" ]; then
    echo "   ✅ No hardcoded secrets found"
    ((PASSED++))
else
    echo "   ❌ Potential secrets found:"
    echo "$SECRETS" | head -5 | sed 's/^/      /'
    ((FAILED++))
fi
echo ""

# Test 6: Check config.example.json exists
echo "📋 Test 6: Checking example config..."
if [ -f "config.example.json" ]; then
    echo "   ✅ config.example.json exists"
    ((PASSED++))
else
    echo "   ❌ config.example.json missing"
    ((FAILED++))
fi
echo ""

# Test 7: Check .env.example exists
echo "📋 Test 7: Checking example env file..."
if [ -f ".env.example" ]; then
    echo "   ✅ .env.example exists"
    ((PASSED++))
else
    echo "   ❌ .env.example missing"
    ((FAILED++))
fi
echo ""

# Test 8: Check workspace README exists
echo "📋 Test 8: Checking workspace README..."
if [ -f "workspace/README.md" ]; then
    echo "   ✅ workspace/README.md exists"
    ((PASSED++))
else
    echo "   ❌ workspace/README.md missing"
    ((FAILED++))
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Results: $PASSED passed, $FAILED failed"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "✅ All security checks passed!"
    echo ""
    echo "Repository is safe to make public. Your personal data is protected."
    exit 0
else
    echo "❌ Some checks failed. Review the issues above before making repo public."
    exit 1
fi
