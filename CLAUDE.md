# CLAUDE.md

TypeDown is a Typora-inspired markdown editor that renders markdown as you type (WYSIWYG) while maintaining the ability to toggle into raw source mode. Built with Tauri 2 + Svelte 5 + CodeMirror 6.

## Package Manager

Use `npm` for all dependency management.

## Development Commands

```bash
npm run dev          # Vite dev server (port 1420)
npm run tauri dev    # Full desktop app with hot reload
npm run tauri build  # Create distributable
npm run check        # Svelte type validation
```

## Project Structure

```
src/
  routes/+page.svelte    # Main editor: CodeMirror init, tabs, file I/O, shortcuts
  lib/editor/preview.js  # Decoration engine: widgets, expand-on-focus
  app.css                # Global styles, CSS variables
src-tauri/
  src/lib.rs             # Tauri app with dialog, fs, opener plugins
  tauri.conf.json        # Window/bundle config
.docs/
  SPEC.md                # Product spec with feature roadmap
```

## CodeMirror Decoration Patterns

The editor uses CodeMirror 6 decorations for live preview rendering.

**Decoration types:**
- `Decoration.replace({ widget })` - Hide syntax by replacing with widget (`#`, `**`, backticks, link syntax)
- `Decoration.widget` - Insert rendered elements (images, checkboxes, HR)
- `Decoration.mark` - Apply styling classes without hiding (bold, italic styling)
- `Decoration.line` - Apply classes to entire lines (headings, code blocks)

**Cursor positioning:**
When hiding markdown syntax, use `Decoration.replace` with `ZeroWidthWidget` (renders `\u200B` zero-width space). NEVER use `font-size: 0` or `display: none` on mark decorations - this breaks CodeMirror's `posAtCoords` and causes cursor misalignment.

**Expand-on-focus:**
`selectionIntersects()` checks if cursor is within a decorated range. When true, decorations are skipped so raw syntax becomes visible. For code blocks, the entire block range is tracked so fence markers show when cursor is anywhere inside.

## Key Implementation Details

**Keyboard shortcut priority:** Custom shortcuts must come BEFORE `defaultKeymap` in the keymap array. CodeMirror processes keymaps in order.

**Tab management:** Tab switching uses `Transaction.addToHistory.of(false)` to prevent content swaps from polluting undo history.

**File I/O:** Uses Tauri plugins - `@tauri-apps/plugin-dialog` for pickers, `@tauri-apps/plugin-fs` for read/write, `@tauri-apps/plugin-opener` for external links.

## Design System

```css
/* Core colors */
--surface-0: #FAFAF8;      /* Background */
--ink-primary: #1C1C1A;    /* Text */
--accent: #2D7D7D;         /* Teal accent */
--ink-tertiary: #8A8984;   /* Muted text */

/* Typography */
--font-serif: 'Newsreader', Georgia, serif;
--font-sans: 'DM Sans', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'SF Mono', monospace;
```

## Current Status

Phase 1 (MVP) complete. See `.docs/SPEC.md` for Phase 2 (tables, theming) and Phase 3 (math, diagrams) roadmap.
