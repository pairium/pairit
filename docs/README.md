# Pairit Documentation

For full documentation visit [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/).

## Commands

- `uv sync` - Install dependencies using [uv](https://docs.astral.sh/uv/guides/install-python/).
- `source .venv/bin/activate` - Activate environment.
- `mkdocs serve` - Start the live-reloading docs server.
- `mkdocs build` - Build the documentation site.

## Project layout

    mkdocs.yml    # The configuration file.
    docs/
        index.md  # The documentation homepage.
        ...       # Other markdown pages, images and other files.

## Deployment

1. Run `mkdocs build`.
2. Then `firebase deploy --only hosting`.