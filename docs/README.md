# Pairit Documentation

Live site: [pairium.github.io/pairit](https://pairium.github.io/pairit/).

## Commands

- `uv sync` - Install dependencies using [uv](https://docs.astral.sh/uv/guides/install-python/).
- `source .venv/bin/activate` - Activate environment.
- `mkdocs serve` - Start the live-reloading docs server.
- `mkdocs build` - Build the documentation site.

## Project layout

    mkdocs.yml    # The configuration file.
    overrides/    # Theme overrides (footer).
    docs/
        index.md  # The documentation homepage.
        ...       # Other markdown pages, images and other files.

## Deployment

Pushes to `docs/**` on `main` deploy to GitHub Pages (`.github/workflows/docs.yml`). Manual: `gh workflow run docs.yml`.

## Theme

[mkdocs-shadcn](https://github.com/asiffer/mkdocs-shadcn) by [@asiffer](https://github.com/asiffer).