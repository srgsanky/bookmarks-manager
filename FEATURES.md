# Bookmarks Manager - Features

## Extension
- Export all Chrome bookmarks to JSON with a save-as dialog.
- Import bookmarks from JSON and replace existing bookmarks.
- Clear all bookmarks across bookmark bar, other bookmarks, and mobile folders.

## Web App
- Import/export Chrome-style bookmark JSON.
- Column view for top-level folders, with tree-style hierarchy rendering.
- Bookmark cards show favicon, title, and URL (truncated to 60 characters) with wrapping.
- Per-folder and overall bookmark counts, shown as subtle bubbles.
- Inline rename for bookmarks and folders (pencil icon).
- Delete bookmarks or folders (confirmation for non-empty folders).
- Create folders at any level.
- Drag-and-drop reordering and regrouping (drop between items or onto folders), with a drop-level label.
- Fuzzy search by default; prefix with a single quote for substring search.
- Duplicate bookmark detector with toggle and stateful label.
- Light/dark themes with manual toggle.
- LocalStorage persistence for ongoing edits.
- Tooltips on hover show full title, URL, and breadcrumb path.
- Folder rows support click-to-collapse with per-column expand/collapse controls.
- Indented rows with rounded borders, level badges, and folder-specific background tinting.

## Deviations
- The extension lives in `extension/` and the web app in `webapp/` for clarity.
- Importing in the extension always replaces existing bookmarks (confirmation required).
- Drag-and-drop supports moving items between parents and ordering via drop zones; it does not yet provide a visual "ghost" preview line beyond the active zone highlight.
