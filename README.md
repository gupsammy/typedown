# TypeDown

A minimal, elegant markdown editor inspired by Typora. Write in markdown with live WYSIWYG preview — syntax hides as you type and reveals when you need it.

**[Download for macOS](https://github.com/gupsammy/typedown/releases/latest/download/typedown.dmg)**

## Features

**Live Preview** — Markdown renders instantly as you type. Headers, bold, italics, links, and code all appear formatted in real-time.

**Expand-on-Focus** — Syntax characters hide when you're reading but reveal when your cursor approaches. Edit naturally without switching modes.

**Multi-Tab Editing** — Work on multiple documents simultaneously with a clean tab interface.

**Draft Auto-Save** — Unsaved work is automatically preserved. Close the app and your drafts restore on next launch.

**Keyboard-First** — Full keyboard shortcut support for formatting, navigation, and file operations.

**Native macOS App** — Built with Tauri for a fast, lightweight native experience.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/)
- [Tauri prerequisites](https://tauri.app/start/prerequisites/)

### Getting Started

```bash
git clone https://github.com/gupsammy/typedown.git
cd typedown
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

Binaries will be in `src-tauri/target/release/bundle/`.

## License

MIT
