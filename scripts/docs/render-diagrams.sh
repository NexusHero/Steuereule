#!/usr/bin/env bash
# Renders every PlantUML diagram of the docs twice: <name>.svg in the light theme and <name>.dark.svg
# in the app's "dunkel" theme (docs/diagram-style.puml). Run from the repository root after editing a
# .puml file. Needs `plantuml` on the PATH (the committed SVGs were made with 1.2026.6) and Graphviz
# (`dot`) for the one diagram that does not use the built-in layout.
set -euo pipefail

sources=(docs/arc42/*.puml docs/adr/*.puml docs/diagrams/*.puml)
dark_dir="$(mktemp -d)"
trap 'rm -rf "$dark_dir"' EXIT

plantuml -tsvg "${sources[@]}"

for source in "${sources[@]}"; do
  name="$(basename "$source" .puml)"
  plantuml -tsvg -DDARK=1 -o "$dark_dir" "$source"
  mv "$dark_dir/$name.svg" "$(dirname "$source")/$name.dark.svg"
done
