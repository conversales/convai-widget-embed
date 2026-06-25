#!/bin/bash

# Test script for publish workflow validation
# Mirrors the logic in .github/workflows/publish.yml

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TESTS_PASSED=0
TESTS_FAILED=0
SKIP_NPM_CHECKS="${SKIP_NPM_CHECKS:-0}"

extract_package_name() {
  echo "$1" | rev | cut -d'@' -f2- | rev
}

extract_tag_version() {
  echo "$1" | rev | cut -d'@' -f1 | rev
}

package_path_from_name() {
  echo "packages/$(echo "$1" | sed 's/^@[^/]*\///')"
}

is_dep_published() {
  local dep_name="$1"
  local dep_version="$2"
  npm view "$dep_name@$dep_version" version &>/dev/null
}

check_workspace_deps_on_npm() {
  local workspace_deps="$1"
  local allow_unpublished_local="$2"
  local missing=0

  for DEP in $workspace_deps; do
    DEP_NAME=$(echo "$DEP" | rev | cut -d'@' -f2- | rev)
    DEP_VERSION=$(echo "$DEP" | rev | cut -d'@' -f1 | rev)

    if is_dep_published "$DEP_NAME" "$DEP_VERSION"; then
      echo "  ✓ $DEP_NAME@$DEP_VERSION is published"
      continue
    fi

    if [ "$allow_unpublished_local" = "1" ]; then
      LOCAL_VERSION=$(node -p "require('./$(package_path_from_name "$DEP_NAME")/package.json').version" 2>/dev/null || echo "")
      if [ "$DEP_VERSION" = "$LOCAL_VERSION" ]; then
        echo "  ⚠ $DEP_NAME@$DEP_VERSION is not on npm yet (matches local package.json)"
        continue
      fi
    fi

    echo "  ✗ $DEP_NAME@$DEP_VERSION is NOT published"
    missing=1
  done

  return $missing
}

get_workspace_deps() {
  local package_path="$1"
  node -p "
    const pkg = require('./${package_path}/package.json');
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    Object.entries(deps)
      .filter(([_, version]) => version.startsWith('workspace:'))
      .map(([name, version]) => {
        const pkgPath = 'packages/' + name.replace(/^@[^/]+\\//, '') + '/package.json';
        try {
          const depPkg = require('./' + pkgPath);
          if (depPkg.private) return null;
          return name + '@' + depPkg.version;
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean)
      .join(' ');
  " 2>/dev/null || echo ""
}

test_case() {
  local test_name="$1"
  echo -e "\n${YELLOW}TEST: $test_name${NC}"
}

pass() {
  echo -e "${GREEN}✓ PASS${NC}"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

fail() {
  echo -e "${RED}✗ FAIL: $1${NC}"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

echo "======================================"
echo "Testing Publish Workflow Validation"
echo "======================================"

CORE_PKG="@conversales/convai-widget-core"
CORE_VERSION=$(node -p "require('./packages/convai-widget-core/package.json').version")
EMBED_PKG="@conversales/convai-widget-embed"
EMBED_VERSION=$(node -p "require('./packages/convai-widget-embed/package.json').version")

# ===== TEST 1: Version extraction and validation =====
test_case "Version extraction for ${CORE_PKG}@${CORE_VERSION}"

TAG_NAME="${CORE_PKG}@${CORE_VERSION}"
TAG_VERSION=$(extract_tag_version "$TAG_NAME")
PACKAGE_NAME=$(extract_package_name "$TAG_NAME")
PACKAGE_PATH=$(package_path_from_name "$PACKAGE_NAME")
PACKAGE_JSON_VERSION=$(node -p "require('./$PACKAGE_PATH/package.json').version")

echo "  Tag: $TAG_NAME"
echo "  Extracted package name: $PACKAGE_NAME"
echo "  Extracted tag version: $TAG_VERSION"
echo "  Package path: $PACKAGE_PATH"
echo "  package.json version: $PACKAGE_JSON_VERSION"

if [ "$PACKAGE_NAME" = "$CORE_PKG" ] && [ "$TAG_VERSION" = "$CORE_VERSION" ] && [ "$TAG_VERSION" = "$PACKAGE_JSON_VERSION" ]; then
  pass
else
  fail "Version extraction or validation failed"
fi

# ===== TEST 2: Version mismatch detection =====
test_case "Version mismatch detection (tag vs package.json)"

TAG_NAME="${CORE_PKG}@0.0.0-mismatch"
TAG_VERSION=$(extract_tag_version "$TAG_NAME")
PACKAGE_NAME=$(extract_package_name "$TAG_NAME")
PACKAGE_PATH=$(package_path_from_name "$PACKAGE_NAME")
PACKAGE_JSON_VERSION=$(node -p "require('./$PACKAGE_PATH/package.json').version")

echo "  Tag version: $TAG_VERSION"
echo "  package.json version: $PACKAGE_JSON_VERSION"

if [ "$TAG_VERSION" != "$PACKAGE_JSON_VERSION" ]; then
  echo "  ✓ Mismatch correctly detected"
  pass
else
  fail "Should have detected version mismatch"
fi

# ===== TEST 3: Beta tag detection =====
test_case "Beta tag detection"

FULL_TAG_NAME="${EMBED_PKG}@${EMBED_VERSION}-beta.1"
if [[ "$FULL_TAG_NAME" == *"beta"* ]]; then
  PUBLISH_TAG="beta"
else
  PUBLISH_TAG="latest"
fi

echo "  Tag: $FULL_TAG_NAME"
echo "  Detected publish tag: $PUBLISH_TAG"

if [ "$PUBLISH_TAG" = "beta" ]; then
  pass
else
  fail "Should have detected beta tag"
fi

# ===== TEST 4: Latest tag detection =====
test_case "Latest tag detection"

FULL_TAG_NAME="${EMBED_PKG}@${EMBED_VERSION}"
if [[ "$FULL_TAG_NAME" == *"beta"* ]]; then
  PUBLISH_TAG="beta"
else
  PUBLISH_TAG="latest"
fi

echo "  Tag: $FULL_TAG_NAME"
echo "  Detected publish tag: $PUBLISH_TAG"

if [ "$PUBLISH_TAG" = "latest" ]; then
  pass
else
  fail "Should have detected latest tag"
fi

# ===== TEST 5: Workspace dependency extraction for embed =====
test_case "Workspace dependency extraction for ${EMBED_PKG}"

PACKAGE_PATH=$(package_path_from_name "$EMBED_PKG")
WORKSPACE_DEPS=$(get_workspace_deps "$PACKAGE_PATH")

echo "  Workspace deps: $WORKSPACE_DEPS"

if [ -n "$WORKSPACE_DEPS" ]; then
  pass
else
  fail "Should have found workspace dependencies"
fi

# ===== TEST 6: Verify published dependency on npm =====
test_case "Verify latest published ${CORE_PKG} on npm"

if [ "$SKIP_NPM_CHECKS" = "1" ]; then
  echo "  Skipped (SKIP_NPM_CHECKS=1)"
  pass
else
  PUBLISHED_VERSION=$(npm view "$CORE_PKG" version 2>/dev/null || echo "")
  if [ -n "$PUBLISHED_VERSION" ] && npm view "$CORE_PKG@$PUBLISHED_VERSION" version &>/dev/null; then
    echo "  ✓ $CORE_PKG@$PUBLISHED_VERSION is published"
    pass
  else
    fail "$CORE_PKG should have a published version on npm"
  fi
fi

# ===== TEST 7: Detect unpublished dependency =====
test_case "Detect unpublished dependency ${CORE_PKG}@999.999.999"

if [ "$SKIP_NPM_CHECKS" = "1" ]; then
  echo "  Skipped (SKIP_NPM_CHECKS=1)"
  pass
else
  if npm view "$CORE_PKG@999.999.999" version &>/dev/null; then
    fail "Should not have found non-existent version"
  else
    echo "  ✓ Correctly identified as unpublished"
    pass
  fi
fi

# ===== TEST 8: Dependency chain for embed -> core =====
test_case "Verify dependency chain: ${EMBED_PKG} -> ${CORE_PKG}"

PACKAGE_PATH=$(package_path_from_name "$EMBED_PKG")
WORKSPACE_DEPS=$(get_workspace_deps "$PACKAGE_PATH")

echo "  Workspace deps for $EMBED_PKG: $WORKSPACE_DEPS"

if [ "$SKIP_NPM_CHECKS" = "1" ]; then
  echo "  Skipped npm publish checks (SKIP_NPM_CHECKS=1)"
  pass
elif check_workspace_deps_on_npm "$WORKSPACE_DEPS" "1"; then
  pass
else
  fail "Some dependencies are not published"
fi

# ===== TEST 9: Full validation for embed =====
test_case "Full validation for ${EMBED_PKG}@${EMBED_VERSION}"

TAG_NAME="${EMBED_PKG}@${EMBED_VERSION}"
TAG_VERSION=$(extract_tag_version "$TAG_NAME")
PACKAGE_NAME=$(extract_package_name "$TAG_NAME")
PACKAGE_PATH=$(package_path_from_name "$PACKAGE_NAME")
PACKAGE_JSON_VERSION=$(node -p "require('./$PACKAGE_PATH/package.json').version")

echo "  Step 1: Check version match"
STEP9_FAILED=false
if [ "$TAG_VERSION" != "$PACKAGE_JSON_VERSION" ]; then
  fail "Version mismatch in step 1"
  STEP9_FAILED=true
else
  echo "    ✓ Version matches: $TAG_VERSION"
fi

echo "  Step 2: Check workspace dependencies"
WORKSPACE_DEPS=$(get_workspace_deps "$PACKAGE_PATH")

if [ -z "$WORKSPACE_DEPS" ]; then
  echo "    ✓ No workspace dependencies to check"
elif [ "$SKIP_NPM_CHECKS" = "1" ]; then
  echo "    Workspace deps: $WORKSPACE_DEPS"
  echo "    Skipped npm publish checks (SKIP_NPM_CHECKS=1)"
else
  echo "    Workspace deps: $WORKSPACE_DEPS"
  if ! check_workspace_deps_on_npm "$WORKSPACE_DEPS" "1"; then
    fail "Unpublished workspace dependencies in step 2"
    STEP9_FAILED=true
  fi
fi

if [ "$STEP9_FAILED" = false ]; then
  pass
fi

# ===== TEST 10: Version extraction for all publishable packages =====
test_case "Test version extraction for all packages"

for pkg_path in packages/convai-widget-core packages/convai-widget-embed packages/types packages/react-native packages/client packages/react; do
  if [ ! -f "$pkg_path/package.json" ]; then
    continue
  fi

  PKG_NAME=$(node -p "require('./$pkg_path/package.json').name")
  PKG_VERSION=$(node -p "require('./$pkg_path/package.json').version")

  TAG_NAME="${PKG_NAME}@${PKG_VERSION}"
  EXTRACTED_VERSION=$(extract_tag_version "$TAG_NAME")
  EXTRACTED_NAME=$(extract_package_name "$TAG_NAME")
  EXTRACTED_PATH=$(package_path_from_name "$EXTRACTED_NAME")

  if [ "$EXTRACTED_NAME" != "$PKG_NAME" ] || [ "$EXTRACTED_VERSION" != "$PKG_VERSION" ] || [ "$EXTRACTED_PATH" != "$pkg_path" ]; then
    fail "  ✗ $PKG_NAME: extraction failed (got $EXTRACTED_NAME@$EXTRACTED_VERSION at $EXTRACTED_PATH)"
    continue
  fi

  echo "  ✓ $PKG_NAME@$PKG_VERSION - extraction works"
done

pass

# ===== SUMMARY =====
echo ""
echo "======================================"
echo "Test Summary"
echo "======================================"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed!${NC}"
  echo "Tip: set SKIP_NPM_CHECKS=1 to run local validation only."
  exit 1
fi
