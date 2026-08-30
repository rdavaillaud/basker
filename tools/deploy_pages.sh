#!/bin/sh
# Déploie web/ sur la branche gh-pages avec estampille de version :
# - ?v=<stamp> sur les scripts d'entrée (cassage de cache)
# - numéro de version affiché en pied de page
# Usage : tools/deploy_pages.sh <répertoire-worktree-gh-pages> [message]
set -e
WORKTREE="${1:?usage: deploy_pages.sh <worktree gh-pages> [message]}"
MSG="${2:-Mise à jour Pages}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date -u +%Y%m%d-%H%M)-$(git -C "$ROOT" rev-parse --short HEAD)"

cd "$WORKTREE"
git rm -rq . 2>/dev/null || true
cp -r "$ROOT"/web/* .
touch .nojekyll

for f in index.html plan.html; do
  sed -i "s|src=\"js/main.js\"|src=\"js/main.js?v=$STAMP\"|; s|src=\"js/plan.js\"|src=\"js/plan.js?v=$STAMP\"|" "$f"
  sed -i "s|</main>|<p class=\"footer\">version $STAMP</p></main>|" "$f"
done

# estampille aussi les imports entre modules et les fetch de données, sinon
# un navigateur peut mêler HTML frais et modules en cache
for f in js/*.js; do
  sed -i -E "s|from '\./([A-Za-z0-9_]+\.js)'|from './\1?v=$STAMP'|g" "$f"
  sed -i -E "s|fetch\('data/([^']+)'\)|fetch('data/\1?v=$STAMP')|g" "$f"
  sed -i "s|\${baseUrl}/\${n}\`|\${baseUrl}/\${n}?v=$STAMP\`|g" "$f"
done

git add -A
git commit -q -m "$MSG (version $STAMP)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015U2MynEMiyjCjtM3HvwKzK"
git push -q origin gh-pages
echo "Déployé : version $STAMP"
