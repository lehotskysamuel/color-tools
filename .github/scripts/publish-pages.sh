#!/usr/bin/env bash
# Publishes one folder of the GitHub Pages site on the gh-pages branch.
#
#   publish-pages.sh <folder> <build-dir>   replace <folder>/ with the contents of <build-dir>
#   publish-pages.sh <folder>               remove <folder>/
#
# Every run also rewrites the site root: index.html (redirect to main/), 404.html and .nojekyll.
# The branch is kept as a single commit so deploys don't pile up history. Pushes use
# --force-with-lease against the commit this run started from, so two deploys running at the
# same time never overwrite each other: the loser re-fetches and tries again.
#
# Environment: PAGES_BRANCH (default gh-pages), PAGES_BASE_PATH (default /<repo-name>/).
set -euo pipefail

folder=${1:?usage: publish-pages.sh <folder> [build-dir]}
build=${2:-}
branch=${PAGES_BRANCH:-gh-pages}
repo_name=${GITHUB_REPOSITORY:-$(basename "$(git rev-parse --show-toplevel)")}
base_path=${PAGES_BASE_PATH:-/${repo_name#*/}/}
templates=$(cd "$(dirname "${BASH_SOURCE[0]}")/../pages" && pwd)

if [[ ! $folder =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "Invalid folder name: $folder" >&2
  exit 1
fi
if [[ -n $build ]]; then
  build=$(cd "$build" && pwd)
  action="Publish $folder"
else
  action="Remove $folder"
fi

export GIT_AUTHOR_NAME="github-actions[bot]" GIT_COMMITTER_NAME="github-actions[bot]"
export GIT_AUTHOR_EMAIL="41898282+github-actions[bot]@users.noreply.github.com"
export GIT_COMMITTER_EMAIL=$GIT_AUTHOR_EMAIL

site=$(mktemp -d)
remove_site() {
  git worktree remove --force "$site" >/dev/null 2>&1 || true
  rm -rf "$site"
}
trap remove_site EXIT

for attempt in 1 2 3 4 5 6; do
  remove_site
  if git fetch --quiet --depth=1 origin "+refs/heads/$branch:refs/remotes/origin/$branch" 2>/dev/null; then
    base=$(git rev-parse "refs/remotes/origin/$branch")
    git worktree add --quiet --detach "$site" "$base"
  else
    base=""
    git worktree add --quiet --detach "$site"
    git -C "$site" rm -rq --cached . >/dev/null
    git -C "$site" clean -fdxq
  fi

  rm -rf "${site:?}/$folder"
  if [[ -n $build ]]; then
    mkdir -p "$site/$folder"
    cp -R "$build/." "$site/$folder/"
  fi
  cp "$templates/index.html" "$site/index.html"
  sed "s|__BASE_PATH__|$base_path|g" "$templates/404.html" > "$site/404.html"
  touch "$site/.nojekyll"

  git -C "$site" add -A
  tree=$(git -C "$site" write-tree)
  if [[ -n $base && $tree == "$(git rev-parse "$base^{tree}")" ]]; then
    echo "$action: already up to date."
    exit 0
  fi
  commit=$(git -C "$site" commit-tree "$tree" -m "$action")
  if git push --quiet --force-with-lease="refs/heads/$branch:$base" origin "$commit:refs/heads/$branch"; then
    echo "$action: pushed to $branch."
    exit 0
  fi
  echo "$action: $branch moved while publishing (attempt $attempt), retrying." >&2
  sleep $((attempt * 2))
done

echo "$action: gave up after repeated conflicts on $branch." >&2
exit 1
