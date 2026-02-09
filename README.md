# Bookmarks Manager

Bookmarks Manager is a pair of tools: a browser extension that exports/imports bookmarks, and a standalone web app that lets you visualize
and reorganize them before exporting again.

This project is inspired by the workflow in <https://github.com/srgsanky/ChromeTabsBackup>, but is focused on bookmarks instead of tabs.

## What’s Included
- A browser extension to export bookmarks to JSON, import JSON back into the browser, and clear all bookmarks.
- A standalone web app to browse a multi-column tree view, search, rename, reorder, and export an updated JSON.

## Features
- Column layout for top-level folders with a nested tree view.
- Drag-and-drop ordering and regrouping.
- Search by title or URL (fuzzy by default; prefix with `'` for substring search).
- Duplicate bookmark toggle with count.
- Folder creation, rename, delete with confirmation for non-empty folders.
- Light and dark themes.
- LocalStorage persistence; export only when requested.

## Project Structure
- Extension: `extension`
- Web app: `webapp`

## Usage
1. Load the extension in Chrome.
2. Export bookmarks to JSON.
3. Open the web app in a browser and import the JSON.
4. Make changes and export JSON.
5. Import the updated JSON back into the extension.

## Notes
- The web app does not directly modify browser bookmarks; it edits a local JSON snapshot.
- The extension replaces existing bookmarks on import (with confirmation).
