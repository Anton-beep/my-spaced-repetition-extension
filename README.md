# My Spaced Repetition Extension

## Features
- Tracks concepts directory and updates or creates files in flashcards directory
- Manage tags of flashcards to create hierarchical spaced repetition system, where if concept is dependent on another concept, it will not be reviewed until the parent concept is mastered.

## How to use
- Clone this repo.
- Make sure your NodeJS is at least v16 (`node --version`).
- `npm i` or `yarn` to install dependencies.
- `npm run dev` to start compilation in watch mode.

## Manually installing the plugin
- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/my-spaced-repetition-extension/`.

## Improve code quality with eslint (optional)
Use `npm run lint` and `npm run lint:fix` to check and fix code quality issues.

## API Documentation
See https://github.com/obsidianmd/obsidian-api
