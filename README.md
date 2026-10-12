# The Ideas Board

A small, phone-first web app for brainstorming and organizing ideas as a tree.
Installable as a PWA and works offline. Ideas are stored only on your device (localStorage, key `ideas-board:v1`).

## Using it on a phone
- **Add**: type in the bar at the bottom and press Enter (or Add). The keyboard stays open for the next idea.
- **Edit**: tap an idea's text. Enter saves.
- **Sub-idea**: tap ＋ on a row.
- **Collapse / expand**: tap the ▸ arrow (a badge shows how many are hidden).
- **More actions**: tap ⠿ for Edit, Add sub-idea, Up/Down, Indent/Outdent, Delete (with Undo).
- **Drag**: hold ⠿ briefly, then drag up/down to reorder; drag right/left to nest/un-nest.
- **Boards**: tap the board name to switch, create, rename or delete boards.
- **Backup**: ⋯ → Export / Import (JSON).

## Development
```
npm install
npm run dev      # local dev server
npm test         # unit tests (vitest)
npm run lint
npm run build
```
Deployed to GitHub Pages by `.github/workflows/deploy.yml` (Vite `base: '/ideas-board/'`).
