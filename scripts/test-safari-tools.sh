#!/bin/bash
# Quick test script for Safari tools

echo "Testing Safari Tools Availability..."
echo "===================================="
echo ""

# Check if gateway is running
if ! lsof -i :19789 > /dev/null 2>&1; then
    echo "❌ Gateway not running on port 19789"
    echo "Run: npm start"
    exit 1
fi

echo "✓ Gateway is running"
echo ""

# Test connection
echo "Testing connection..."
if curl -s http://127.0.0.1:19789/api/health > /dev/null 2>&1; then
    echo "✓ Gateway responds to health check"
else
    echo "❌ Gateway not responding"
    exit 1
fi

echo ""
echo "===================================="
echo "✓ Gateway is ready!"
echo ""
echo "Now run: talon tui"
echo "Then ask: 'List all available tools'"
echo ""
echo "Expected: Should show 38 tools (not 30)"
echo "Look for: apple_safari_navigate, apple_safari_extract, etc."
