# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeDown is a Typora-inspired markdown editor that renders markdown as you type (WYSIWYG) while maintaining the ability to toggle into raw source mode. Built with Tauri + Svelte + CodeMirror 6.

## Development Commands

```bash
npm run dev          # Start Vite dev server (port 1420)
npm run tauri dev    # Run full desktop app with hot reload
npm run tauri build  # Create distributable desktop app
npm run check        # Run svelte-check type validation
```

## Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Runtime | Tauri 2 |
| Frontend | Svelte 5 + SvelteKit 2.9 |
| Editor Core | CodeMirror 6 |
| Styling | CSS with custom properties |

### Key Files

**Frontend:**
- `src/routes/+page.svelte` - Main editor component: CodeMirror initialization, tab management, file I/O, keyboard shortcuts, word/character count
- `src/lib/editor/preview.js` - Preview rendering engine: decoration-based markdown rendering, widgets (images, checkboxes, links, HR), expand-on-focus behavior
- `src/app.css` - Global styles and CSS variables

**Desktop (Rust):**
- `src-tauri/src/lib.rs` - Tauri app initialization with dialog, filesystem, and opener plugins
- `src-tauri/tauri.conf.json` - Window configuration, bundle settings

**Documentation:**
- `.docs/SPEC.md` - Full product specification with phased feature roadmap

### CodeMirror Decoration System

The editor uses CodeMirror 6's decoration system for live preview rendering:

- `Decoration.replace` hides markdown syntax (e.g., `**` for bold)
- `Decoration.widget` inserts rendered elements (images, checkboxes, HR)
- `Decoration.mark` applies styling classes (bold, italic, code)
- Selection tracking reveals raw syntax when cursor enters decorated regions (expand-on-focus)
- Source mode toggle (`Cmd+/`) disables all decorations

### Tab Management

Tabs are tracked with reactive state containing content, file paths, dirty flags, and cursor positions. Tab switching preserves editor state via `EditorState.toJSON()` / `EditorState.fromJSON()`.

### File I/O

Uses Tauri plugins for native file system access:
- `@tauri-apps/plugin-dialog` for file pickers
- `@tauri-apps/plugin-fs` for read/write operations
- `@tauri-apps/plugin-opener` for opening links in browser

## CSS Variables

The theme uses these key CSS variables in `app.css`:

```css
--paper: #FAFAF8;       /* Background */
--ink: #2C2C2C;         /* Text color */
--teal: #2D7D7D;        /* Accent color */
--ink-ghost: #8B8B8B;   /* Muted text */
```

## Current Implementation Status

Phase 1 (MVP) is implemented with core editing features. See `.docs/SPEC.md` for full feature roadmap including Phase 2 (tables, theming, smart paste) and Phase 3 (math, diagrams, TOC).
