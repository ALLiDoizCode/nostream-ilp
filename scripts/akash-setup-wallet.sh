#!/bin/bash
#
# Akash Wallet Setup Helper Script
#
# This script helps you set up and fund your Akash testnet wallet
#

set -e

WALLET_FILE=".akash-wallet.txt"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "================================================"
echo "Akash Wallet Setup Helper"
echo "================================================"
echo ""

# Check if wallet file exists
if [ ! -f "$WALLET_FILE" ]; then
    echo "❌ Error: Wallet file not found: $WALLET_FILE"
    echo ""
    echo "Generate a wallet first by running:"
    echo "  node -e \"..."
    echo ""
    echo "Or contact the developer to generate one for you."
    exit 1
fi

# Extract wallet address and mnemonic
WALLET_ADDRESS=$(grep "Address:" "$WALLET_FILE" | awk '{print $2}')
WALLET_MNEMONIC=$(sed -n '/^main action/p' "$WALLET_FILE")

if [ -z "$WALLET_ADDRESS" ]; then
    echo "❌ Error: Could not parse wallet address from $WALLET_FILE"
    exit 1
fi

if [ -z "$WALLET_MNEMONIC" ]; then
    echo "❌ Error: Could not parse mnemonic from $WALLET_FILE"
    exit 1
fi

echo "📋 Wallet Information"
echo "--------------------"
echo "Address: $WALLET_ADDRESS"
echo "Mnemonic: [HIDDEN - see $WALLET_FILE]"
echo ""

# Function to check balance
check_balance() {
    echo "💰 Checking wallet balance..."
    echo ""

    # No need to export AKASH_MNEMONIC - script reads from .akash-wallet.txt automatically
    npm run akash:list 2>&1 | grep -A 5 "Balance" || echo "Could not fetch balance"

    echo ""
}

# Menu
echo "What would you like to do?"
echo ""
echo "1. Fund wallet with testnet AKT (opens faucet website)"
echo "2. Check wallet balance"
echo "3. List deployments"
echo "4. Export mnemonic to environment (for deployment)"
echo "5. Show wallet address (for copying)"
echo "6. Exit"
echo ""
read -p "Enter choice [1-6]: " choice

case $choice in
    1)
        echo ""
        echo "🌐 Opening Akash testnet faucet..."
        echo ""
        echo "Wallet address: $WALLET_ADDRESS"
        echo ""
        echo "Instructions:"
        echo "1. Copy the address above"
        echo "2. Paste it into the faucet website"
        echo "3. Request testnet AKT tokens (usually 25 AKT)"
        echo "4. Wait 30-60 seconds for the transaction to confirm"
        echo ""

        # Open faucet in browser
        if command -v open &> /dev/null; then
            open "https://faucet.testnet.akash.network/"
        elif command -v xdg-open &> /dev/null; then
            xdg-open "https://faucet.testnet.akash.network/"
        else
            echo "Faucet URL: https://faucet.testnet.akash.network/"
        fi

        # Copy address to clipboard if possible
        if command -v pbcopy &> /dev/null; then
            echo "$WALLET_ADDRESS" | pbcopy
            echo "✅ Address copied to clipboard!"
        elif command -v xclip &> /dev/null; then
            echo "$WALLET_ADDRESS" | xclip -selection clipboard
            echo "✅ Address copied to clipboard!"
        fi
        ;;

    2)
        check_balance
        ;;

    3)
        echo ""
        echo "📋 Listing deployments..."
        echo ""
        # No need to export AKASH_MNEMONIC - script reads from .akash-wallet.txt automatically
        npm run akash:list
        ;;

    4)
        echo ""
        echo "📤 Mnemonic Information"
        echo ""
        echo "ℹ️  The deployment script automatically reads from .akash-wallet.txt"
        echo "   No need to export AKASH_MNEMONIC!"
        echo ""
        echo "Just run:"
        echo "  npm run akash:deploy:sandbox"
        echo ""
        echo "If you need to export manually (optional):"
        echo "  export AKASH_MNEMONIC=\"$WALLET_MNEMONIC\""
        echo ""
        ;;

    5)
        echo ""
        echo "📋 Wallet Address:"
        echo ""
        echo "  $WALLET_ADDRESS"
        echo ""

        if command -v pbcopy &> /dev/null; then
            echo "$WALLET_ADDRESS" | pbcopy
            echo "✅ Address copied to clipboard!"
        elif command -v xclip &> /dev/null; then
            echo "$WALLET_ADDRESS" | xclip -selection clipboard
            echo "✅ Address copied to clipboard!"
        fi
        ;;

    6)
        echo "Goodbye!"
        exit 0
        ;;

    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "================================================"
