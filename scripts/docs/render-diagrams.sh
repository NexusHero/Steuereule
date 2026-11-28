#!/usr/bin/env bash
# Renders every PlantUML diagram of the docs twice: <name>.svg in the light theme and <name>.dark.svg
# in the app's "dunkel" theme (docs/diagram-style.puml). Run from the repository root after editing a
# .puml file. Needs `plantuml` on the PATH (the committed SVGs were made with 1.2026.6) and Graphviz
# (`dot`) for the one diagram that does not use the built-in layout.
set -euo pipefail

sources=(docs/arc42/*.puml docs/adr/*.puml docs/diagrams/*.puml)
dark_dir="$(mktemp -d)"
trap 'rm -rf "$dark_dir"' EXIT

# PlantUML writes the font list of the style as one quoted family name, which no browser knows: the text
# then falls back to a serif face. The list is written out as a list, so a reader gets Geist or their
# system's sans-serif.
fix_fonts() {
  sed -i.bak "s/font-family=\"'Geist, system-ui, -apple-system, Segoe UI, sans-serif'\"/font-family=\"Geist, system-ui, -apple-system, 'Segoe UI', sans-serif\"/g" "$1"
  rm -f "$1.bak"
}

plantuml -tsvg "${sources[@]}"

for source in "${sources[@]}"; do
  name="$(basename "$source" .puml)"
  light="$(dirname "$source")/$name.svg"
  dark="$(dirname "$source")/$name.dark.svg"
  plantuml -tsvg -DDARK=1 -o "$dark_dir" "$source"
  mv "$dark_dir/$name.svg" "$dark"
  fix_fonts "$light"
  fix_fonts "$dark"
done
