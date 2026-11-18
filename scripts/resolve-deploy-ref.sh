#!/bin/bash
set -euo pipefail

# resolve-deploy-ref.sh [REF]
# Prints the commit SHA a deploy or docs run may use. REF is blank (latest
# origin/main), a full 40-character commit SHA, or a tag. Refuses anything
# else, and any commit that is not on origin/main, so a workflow never runs
# code from an unmerged branch or a pull request with deploy credentials.
#
# Run it from a checkout of main with full history and tags
# (actions/checkout with fetch-depth: 0).

REF=${1:-}

git fetch --quiet --no-tags origin '+refs/heads/main:refs/remotes/origin/main'

if [ -z "$REF" ]; then
    SHA=$(git rev-parse --verify 'refs/remotes/origin/main^{commit}')
elif [[ "$REF" =~ ^[0-9a-f]{40}$ ]]; then
    if ! SHA=$(git rev-parse --verify --quiet "${REF}^{commit}"); then
        echo "::error::Commit $REF is not in this repository." >&2
        exit 1
    fi
elif [[ "$REF" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$ ]]; then
    git fetch --quiet origin "+refs/tags/$REF:refs/tags/$REF" 2>/dev/null || true
    if ! SHA=$(git rev-parse --verify --quiet "refs/tags/${REF}^{commit}"); then
        echo "::error::No tag named $REF." >&2
        exit 1
    fi
else
    echo "::error::ref must be blank, a full 40-character commit SHA, or a tag name. Got: $REF" >&2
    exit 1
fi

if ! git merge-base --is-ancestor "$SHA" refs/remotes/origin/main; then
    echo "::error::$REF ($SHA) is not on main. Merge it first." >&2
    exit 1
fi

printf '%s\n' "$SHA"
