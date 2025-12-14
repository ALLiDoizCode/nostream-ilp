#!/bin/bash
# Environment Variable Validation Script
# Validates .env.mainnet before Akash deployment
# Usage: ./scripts/validate-env.sh akash/.env.mainnet

set -e

ENV_FILE="${1:-akash/.env.mainnet}"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Error: Environment file not found: $ENV_FILE"
  exit 1
fi

echo "🔍 Validating environment variables in: $ENV_FILE"
echo ""

# Load environment variables
set -a
source "$ENV_FILE"
set +a

ERRORS=0
WARNINGS=0

# Validation functions
validate_required() {
  local var_name="$1"
  local var_value="${!var_name}"

  if [ -z "$var_value" ]; then
    echo "❌ REQUIRED: $var_name is empty"
    ((ERRORS++))
    return 1
  fi
  return 0
}

validate_min_length() {
  local var_name="$1"
  local min_length="$2"
  local var_value="${!var_name}"

  if [ ${#var_value} -lt $min_length ]; then
    echo "❌ ERROR: $var_name must be at least $min_length characters (got ${#var_value})"
    ((ERRORS++))
    return 1
  fi
  return 0
}

validate_hex() {
  local var_name="$1"
  local var_value="${!var_name}"

  if ! [[ "$var_value" =~ ^[0-9a-fA-F]+$ ]]; then
    echo "❌ ERROR: $var_name must be hexadecimal"
    ((ERRORS++))
    return 1
  fi
  return 0
}

warn_default() {
  local var_name="$1"
  local default_value="$2"
  local var_value="${!var_name}"

  if [ "$var_value" == "$default_value" ]; then
    echo "⚠️  WARNING: $var_name is using default value '$default_value'"
    ((WARNINGS++))
    return 1
  fi
  return 0
}

validate_settlement_module() {
  local enabled_var="$1"
  local rpc_var="$2"
  local factory_var="$3"
  local key_var="$4"
  local module_name="$5"

  local enabled="${!enabled_var}"

  if [ "$enabled" == "true" ]; then
    echo "📦 Validating $module_name settlement module..."

    if ! validate_required "$rpc_var"; then
      echo "   ℹ️  $module_name enabled but $rpc_var is empty"
    fi

    if ! validate_required "$factory_var"; then
      echo "   ℹ️  $module_name enabled but $factory_var is empty"
    fi

    if ! validate_required "$key_var"; then
      echo "   ℹ️  $module_name enabled but $key_var is empty (deployment will fail)"
    fi
  else
    echo "⏭️  $module_name settlement module is disabled (OK)"
  fi
}

echo "==================================="
echo "Core Required Variables"
echo "==================================="

validate_required "SECRET" && validate_min_length "SECRET" 32 && validate_hex "SECRET"
validate_required "DB_PASSWORD" && validate_min_length "DB_PASSWORD" 16
validate_required "REDIS_PASSWORD" && validate_min_length "REDIS_PASSWORD" 16
validate_required "DASSIE_RPC_TOKEN" && validate_min_length "DASSIE_RPC_TOKEN" 32 && validate_hex "DASSIE_RPC_TOKEN"
validate_required "DOMAIN"

echo ""
echo "==================================="
echo "Dashboard Authentication"
echo "==================================="

validate_required "DASHBOARD_USERNAME"
validate_required "DASHBOARD_PASSWORD" && validate_min_length "DASHBOARD_PASSWORD" 12
warn_default "DASHBOARD_PASSWORD" "changeme_after_deployment"

echo ""
echo "==================================="
echo "Settlement Modules"
echo "==================================="

validate_settlement_module \
  "SETTLEMENT_BASE_ENABLED" \
  "SETTLEMENT_BASE_RPC_URL" \
  "SETTLEMENT_BASE_FACTORY_ADDRESS" \
  "SETTLEMENT_BASE_RELAY_PRIVATE_KEY" \
  "Base L2"

echo ""

validate_settlement_module \
  "SETTLEMENT_CRONOS_ENABLED" \
  "SETTLEMENT_CRONOS_RPC_URL" \
  "SETTLEMENT_CRONOS_FACTORY_ADDRESS" \
  "SETTLEMENT_CRONOS_RELAY_PRIVATE_KEY" \
  "Cronos"

echo ""
echo "==================================="
echo "Validation Summary"
echo "==================================="
echo "❌ Errors: $ERRORS"
echo "⚠️  Warnings: $WARNINGS"
echo ""

if [ $ERRORS -gt 0 ]; then
  echo "❌ VALIDATION FAILED - Please fix errors before deployment"
  exit 1
fi

if [ $WARNINGS -gt 0 ]; then
  echo "⚠️  VALIDATION PASSED WITH WARNINGS"
  echo "   Please review warnings before production deployment"
  exit 0
fi

echo "✅ VALIDATION PASSED - Environment is ready for deployment"
exit 0
