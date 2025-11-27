#!/bin/bash
# Dassie Development Environment - DNS Setup Script
# This script configures dnsmasq for wildcard *.localhost DNS resolution

set -e

echo "🔧 Configuring dnsmasq for wildcard localhost DNS..."

# Add wildcard localhost resolution to dnsmasq.conf
if ! grep -q "address=/.localhost/127.0.0.1" /opt/homebrew/etc/dnsmasq.conf; then
    echo "address=/.localhost/127.0.0.1" >> /opt/homebrew/etc/dnsmasq.conf
    echo "✅ Added .localhost wildcard DNS entry"
else
    echo "✅ .localhost wildcard DNS already configured"
fi

# Create resolver directory if it doesn't exist
sudo mkdir -p /etc/resolver

# Configure macOS to use dnsmasq for .localhost domains
echo "nameserver 127.0.0.1" | sudo tee /etc/resolver/localhost > /dev/null
echo "✅ Created /etc/resolver/localhost"

# Start dnsmasq service
echo "🚀 Starting dnsmasq service..."
sudo brew services start dnsmasq

# Wait a moment for service to start
sleep 2

# Test the configuration
echo ""
echo "🧪 Testing DNS resolution..."
if ping -c 1 test.localhost &> /dev/null; then
    echo "✅ SUCCESS: test.localhost resolves to 127.0.0.1"
else
    echo "❌ FAILED: test.localhost does not resolve"
    echo "   You may need to flush DNS cache:"
    echo "   sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder"
fi

echo ""
echo "✅ DNS setup complete!"
echo ""
echo "To verify, run:"
echo "  ping test.localhost"
echo "  node -e \"require('dns').lookup('test.localhost', console.log)\""
