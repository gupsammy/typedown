# TypeDown - Product Specification

## Overview

TypeDown is a Typora-inspired markdown editor that renders markdown as you type (WYSIWYG) while maintaining the ability to toggle into raw source mode. It combines the immediacy of live preview with the precision of source editing, wrapped in a minimal, themeable interface.

---

## Technical Architecture

### Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Desktop Runtime | Tauri | Lighter than Electron, Rust backend, smaller bundle |
| Frontend Framework | Svelte | Simple reactivity, small bundle, proven with Tauri |
| Editor Core | CodeMirror 6 | Text-as-truth model makes mode switching trivial; excellent syntax highlighting |
| Markdown Parser | markdown-it (or remark) | Extensible, supports GFM + plugins for math/diagrams |
| Math Rendering | KaTeX | Fast, self-contained, no external dependencies |
| Diagram Rendering | Mermaid.js | Standard for flowcharts, sequence diagrams, etc. |

### Editor Model

CodeMirror 6 treats the document as raw text with decorations layered on top. In preview mode, we:
- Parse markdown to identify block/span boundaries
- Replace syntax markers with rendered widgets (images, formatted text)
- Hide markdown syntax characters using decoration replacements
- When cursor enters a decorated region, expand to show raw syntax (Typora-style)

In source mode (Cmd+/), decorations are disabled; the raw markdown is displayed with syntax highlighting derived from theme colors.

---

## Core Features

### Editing Modes

**Preview Mode (Default)**
- Markdown renders immediately as you type
- Syntax is hidden but revealed on focus (e.g., clicking a heading shows `## ` prefix)
- Images display inline, fitted to content width
- Code blocks show syntax-highlighted, editable code
- Tables support cell-by-cell navigation (Tab/arrow keys) with markdown as underlying format

**Source Mode (Cmd+/)**
- Full raw markdown visible with syntax highlighting
- Syntax colors derived automatically from the active theme's CSS variables
- Cursor position preserved when switching modes
- Images appear as `![alt](path)` links, not rendered

### Supported Markdown (GFM + Extensions)

**Block Elements**
- Headings (ATX style: # through ######)
- Paragraphs with hard line breaks (trailing spaces or `<br/>`)
- Blockquotes (nested supported)
- Ordered and unordered lists
- Task lists with checkboxes `- [ ]` and `- [x]`
- Fenced code blocks with language-specific syntax highlighting
- Tables with alignment (`:---`, `:---:`, `---:`)
- Horizontal rules (`---`, `***`)
- Math blocks (`$$...$$`) rendered via KaTeX
- YAML frontmatter (parsed but not rendered in preview)
- Table of contents (`[toc]`)
- Diagrams: Mermaid code blocks render on blur (not live, to avoid flicker)

**Inline Elements**
- Emphasis (`*italic*`) and strong (`**bold**`)
- Inline code (`` `code` ``)
- Strikethrough (`~~text~~`)
- Links: inline `[text](url)` and reference `[text][ref]`
- Images: `![alt](path)` fitted to content width
- Autolinks: `<url>` and `<email>`
- Footnotes `[^ref]` with hover preview
- Subscript `H~2~O` and superscript `X^2^`
- Highlight `==marked==`
- Inline math `$...$`

### Link Behavior

- **Hover**: Show URL in tooltip
- **Click**: Reveal markdown syntax for editing
- **Cmd+Click**: Open in external browser

### Smart Paste

- **URL over selection**: Automatically creates `[selection](pasted-url)` link
- **HTML from clipboard**: Converts to markdown (from web pages, Word, etc.)
- **Image paste**: Saves screenshot/image to central assets folder, inserts markdown reference

---

## User Interface

### Window Chrome

- **Frameless window** with macOS traffic lights (close/minimize/zoom)
- **Integrated title bar**: Document title centered, tabs as subtle indicators
- Minimal visual chrome to maximize writing space

### Tab System

- Multiple documents via tabs (no sidebar/file tree)
- Tab shows filename and unsaved indicator (dot or asterisk)
- New tab: Cmd+T
- Close tab: Cmd+W
- Switch tabs: Cmd+Shift+[ and Cmd+Shift+]

### Status Bar

- **Word count** and character count
- **Cursor position** (line:column)
- **Save status** (saved/unsaved)

### Layout

- **Fixed content width** (~700px), centered horizontally
- Generous margins for focused writing
- Responsive to window size but content width stays fixed

---

## File Handling

### Supported Files

- `.md` and `.markdown`: Full markdown parsing and preview
- Other text files: Open in plain text mode (no markdown rendering)

### Auto-Save

**Configurable** in settings:
- Manual only (Cmd+S)
- Auto-save on pause (e.g., 2 seconds of inactivity)
- Continuous save

### Image Storage

All pasted/dropped images saved to a **central assets folder**:
- Default: `~/.typedown/assets/`
- Images referenced via absolute path or configurable relative path
- File naming: timestamp + hash to avoid collisions

---

## Theming

### Theme Format

CSS file drop-in, following Typora conventions:

```
~/.typedown/themes/
  └── my-theme.css
```

Filename becomes display name (hyphens to spaces, title case).

### Required CSS Variables

Themes should define these variables in `:root`:

```css
:root {
  /* Colors */
  --bg-color: #ffffff;
  --text-color: #333333;
  --heading-color: #000000;
  --link-color: #0066cc;
  --code-bg: #f5f5f5;
  --code-color: #c7254e;
  --blockquote-border: #ddd;
  --hr-color: #eee;

  /* Typography */
  --font-family: 'Georgia', serif;
  --font-size: 16px;
  --heading-font: 'Helvetica Neue', sans-serif;
  --monospace: 'SF Mono', 'Menlo', monospace;
  --line-height: 1.6;

  /* Layout */
  --content-width: 700px;
  --content-padding: 60px;
}
```

### Source Mode Styling

Source mode syntax highlighting colors are **derived automatically** from theme variables:
- Headings: `--heading-color`
- Links: `--link-color`
- Code: `--code-color`
- Emphasis: `--text-color` with italic
- Strong: `--text-color` with bold

Theme authors don't need to provide separate source mode styles.

### Default Theme

**Minimal/Notion-inspired**:
- Clean sans-serif body (system font stack or similar)
- Generous whitespace
- Subtle colors, high contrast text
- Light mode default (dark mode as separate theme)

---

## Keyboard Shortcuts

Typora-compatible bindings:

| Action | Shortcut |
|--------|----------|
| Toggle source mode | Cmd+/ |
| Bold | Cmd+B |
| Italic | Cmd+I |
| Underline | Cmd+U |
| Strikethrough | Cmd+Shift+S |
| Heading 1-6 | Cmd+1 through Cmd+6 |
| Increase heading | Cmd+= |
| Decrease heading | Cmd+- |
| Link | Cmd+K |
| Image | Cmd+Shift+I |
| Code span | Cmd+` |
| Code block | Cmd+Option+C |
| Quote | Cmd+Shift+Q |
| Ordered list | Cmd+Shift+O |
| Unordered list | Cmd+Shift+U |
| Task list | Cmd+Shift+X |
| Table | Cmd+Option+T |
| Horizontal rule | Cmd+Shift+- |
| Find | Cmd+F |
| Find & Replace | Cmd+Option+F |
| New tab | Cmd+T |
| Close tab | Cmd+W |
| Save | Cmd+S |
| Open | Cmd+O |

---

## Find & Replace

- **Cmd+F**: Find bar at top of editor
- **Cmd+Option+F**: Find and replace panel
- Supports regular expressions
- Highlights all matches, navigates with Enter/Shift+Enter
- Replace one or replace all

---

## Undo/Redo

Standard text undo via CodeMirror's built-in history:
- **Cmd+Z**: Undo
- **Cmd+Shift+Z**: Redo

Mode switching (preview ↔ source) does not affect undo history; it's purely a display toggle.

---

## Scope & Phasing

### Phase 1: Core Editing (MVP)

- [ ] Tauri + Svelte project setup
- [ ] CodeMirror 6 integration with basic markdown mode
- [ ] Preview mode with decoration-based rendering
  - [ ] Headings, paragraphs, emphasis, strong, code spans
  - [ ] Links with hover/click behavior
  - [ ] Images (display inline, fit to width)
  - [ ] Code blocks with syntax highlighting
  - [ ] Lists and task lists
  - [ ] Blockquotes and horizontal rules
- [ ] Source mode toggle (Cmd+/)
- [ ] Cursor position preservation across mode switches
- [ ] Typora-style expand-on-focus for inline elements
- [ ] Basic file operations (open, save, new)
- [ ] Tab system (multiple documents)
- [ ] Frameless window with traffic lights
- [ ] Status bar (word count, cursor position, save status)
- [ ] Default theme (Notion-like minimal)
- [ ] Find & Replace
- [ ] Basic keyboard shortcuts

### Phase 2: Full GFM + Theming

- [ ] Tables with cell navigation
- [ ] CSS theme loading from ~/.typedown/themes/
- [ ] Auto-derived source mode syntax colors
- [ ] Smart paste (URL linking, HTML conversion)
- [ ] Image paste to central assets folder
- [ ] YAML frontmatter parsing
- [ ] Footnotes with hover preview
- [ ] Auto-save configuration

### Phase 3: Extensions

- [ ] Math blocks (KaTeX)
- [ ] Inline math
- [ ] Mermaid diagrams (render on blur)
- [ ] TOC generation
- [ ] Subscript/superscript/highlight
- [ ] Additional keyboard shortcuts (Typora parity)

### Future Considerations (Not in v1)

- Export (HTML, PDF, Word)
- Command palette (Cmd+P)
- Outline/TOC sidebar
- Multi-cursor editing
- Spell checking
- Plugin system
- Cloud sync

---

## Technical Notes

### CodeMirror 6 Decoration Strategy

The key to Typora-style editing is using CodeMirror 6's decoration system:

1. **Parsing**: On each document change, parse markdown to AST (using markdown-it or remark)
2. **Decoration mapping**: For each AST node, create decorations:
   - `Decoration.replace` to hide syntax characters
   - `Decoration.widget` to insert rendered elements (images, checkboxes)
   - `Decoration.mark` to apply styling (bold, italic)
3. **Focus tracking**: When cursor enters a decorated range, remove decorations for that specific element to reveal raw syntax
4. **Mode toggle**: Source mode simply disables all decorations

### Cursor Position Preservation

When toggling modes:
1. Capture current cursor offset (character position)
2. Toggle decoration visibility
3. Restore cursor to same character offset (text content unchanged)

### Theme Variable Extraction

For auto-derived source mode colors:
1. Parse loaded theme CSS
2. Extract `:root` CSS variables
3. Map to CodeMirror highlighting theme:
   - `--heading-color` → heading tokens
   - `--link-color` → url/link tokens
   - etc.

---

## Design Principles

1. **Writing first**: Every UI decision prioritizes the writing experience
2. **Invisible complexity**: Advanced features (themes, extensions) don't clutter the default experience
3. **Typora muscle memory**: Users switching from Typora should feel immediately at home
4. **Performance**: No perceptible lag between keystrokes and rendering
5. **Themeable everything**: Themes can customize every visual aspect

---

## Success Metrics

- Mode switching feels instantaneous
- No visible flicker when typing in preview mode
- Cursor never jumps unexpectedly
- Theme changes apply without restart
- App launches in <500ms
- Smooth scrolling even with many images

---

*Document created: 2024-12-29*
*Status: Draft specification, pending implementation*
