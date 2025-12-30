<script>
  import { onDestroy, onMount } from "svelte";
  import { EditorState, EditorSelection, Compartment, Transaction } from "@codemirror/state";
  import { EditorView, keymap, drawSelection } from "@codemirror/view";
  import { markdown } from "@codemirror/lang-markdown";
  import { defaultKeymap, historyKeymap, indentWithTab, history } from "@codemirror/commands";
  import {
    searchKeymap,
    openSearchPanel,
    highlightSelectionMatches,
  } from "@codemirror/search";
  import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
  import { tags } from "@lezer/highlight";
  import { previewExtension } from "$lib/editor/preview";
  import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
  import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
  import { getCurrentWindow } from "@tauri-apps/api/window";

  let editorEl;
  let view;
  let suppressChange = false;
  let previewMode = true;

  let tabs = [];
  let activeTabId = "";
  let tabCounter = 0;

  let wordCount = 0;
  let charCount = 0;
  let cursorLine = 1;
  let cursorColumn = 1;

  const previewCompartment = new Compartment();

  const sourceHighlight = HighlightStyle.define([
    { tag: tags.heading, color: "var(--heading-color)", fontWeight: "600" },
    { tag: tags.strong, fontWeight: "700" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.link, color: "var(--link-color)" },
    { tag: tags.url, color: "var(--link-color)" },
    { tag: tags.monospace, color: "var(--code-color)" },
    { tag: tags.strikethrough, textDecoration: "line-through" },
  ]);

  const getActiveTab = () => tabs.find((tab) => tab.id === activeTabId);

  const updateTab = (id, updater) => {
    tabs = tabs.map((tab) => (tab.id === id ? updater(tab) : tab));
  };

  const createTab = ({ title, content, path }) => {
    tabCounter += 1;
    const safeTitle = title || `Untitled ${tabCounter}`;
    return {
      id: `tab-${Date.now()}-${tabCounter}`,
      title: safeTitle,
      content: content || "",
      path: path || null,
      savedContent: content || "",
      dirty: false,
      selection: { anchor: 0, head: 0 },
    };
  };

  const selectTab = (id) => {
    if (activeTabId === id) return;
    activeTabId = id;
    const tab = getActiveTab();
    if (view && tab) {
      suppressChange = true;
      const currentLength = view.state.doc.length;
      const nextDoc = tab.content ?? "";
      const clamp = (pos) => Math.max(0, Math.min(nextDoc.length, pos));
      const selection = EditorSelection.single(
        clamp(tab.selection?.anchor ?? 0),
        clamp(tab.selection?.head ?? 0)
      );
      view.dispatch({
        changes: { from: 0, to: currentLength, insert: nextDoc },
        selection,
        annotations: Transaction.addToHistory.of(false),
      });
      updateStatus(view.state);
      suppressChange = false;
    }
  };

  const newTab = () => {
    const tab = createTab({});
    tabs = [...tabs, tab];
    selectTab(tab.id);
  };

  const closeTab = (id) => {
    if (tabs.length === 1) {
      tabs = [createTab({})];
      activeTabId = tabs[0].id;
      selectTab(activeTabId);
      return;
    }
    const remaining = tabs.filter((tab) => tab.id !== id);
    const wasActive = id === activeTabId;
    tabs = remaining;
    if (wasActive) {
      activeTabId = remaining[0]?.id ?? "";
      selectTab(activeTabId);
    }
  };

  const togglePreview = () => {
    previewMode = !previewMode;
    if (view) {
      view.dispatch({
        effects: previewCompartment.reconfigure(previewMode ? previewExtension : []),
      });
    }
  };

  const updateStatus = (state) => {
    const text = state.doc.toString();
    charCount = text.length;
    const trimmed = text.trim();
    wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    cursorLine = line.number;
    cursorColumn = head - line.from + 1;
  };

  const updateActiveFromState = (state) => {
    const tab = getActiveTab();
    if (!tab) return;
    const text = state.doc.toString();
    updateTab(tab.id, (current) => ({
      ...current,
      content: text,
      dirty: text !== current.savedContent,
      selection: {
        anchor: state.selection.main.anchor,
        head: state.selection.main.head,
      },
    }));
  };

  const baseName = (path) => {
    if (!path) return "";
    const parts = path.split(/[/\\\\]/);
    return parts[parts.length - 1];
  };

  const openFile = async () => {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
    });
    if (!selected) return;
    const filePath = Array.isArray(selected) ? selected[0] : selected;
    let content = "";
    try {
      content = await readTextFile(filePath);
    } catch (error) {
      content = await readTextFile({ path: filePath });
    }
    const tab = createTab({ title: baseName(filePath), content, path: filePath });
    tabs = [...tabs, tab];
    selectTab(tab.id);
  };

  const saveFile = async () => {
    const tab = getActiveTab();
    if (!tab) return;
    let targetPath = tab.path;
    if (!targetPath) {
      const suggested = tab.title.endsWith(".md") ? tab.title : `${tab.title}.md`;
      targetPath = await saveDialog({
        defaultPath: suggested,
        filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
      });
      if (!targetPath) return;
    }
    try {
      await writeTextFile(targetPath, tab.content);
    } catch (error) {
      await writeTextFile({ path: targetPath, contents: tab.content });
    }
    updateTab(tab.id, (current) => ({
      ...current,
      path: targetPath,
      title: baseName(targetPath) || current.title,
      savedContent: current.content,
      dirty: false,
    }));
  };

  const wrapSelection = (viewInstance, wrapper) => {
    const { state } = viewInstance;
    const { from, to } = state.selection.main;
    const before = state.doc.sliceString(from - wrapper.length, from);
    const after = state.doc.sliceString(to, to + wrapper.length);
    if (from >= wrapper.length && before === wrapper && after === wrapper) {
      viewInstance.dispatch({
        changes: [
          { from: to, to: to + wrapper.length, insert: "" },
          { from: from - wrapper.length, to: from, insert: "" },
        ],
        selection: { anchor: from - wrapper.length, head: to - wrapper.length },
      });
      return true;
    }
    const selectedText = state.doc.sliceString(from, to);
    viewInstance.dispatch({
      changes: { from, to, insert: `${wrapper}${selectedText}${wrapper}` },
      selection: {
        anchor: from + wrapper.length,
        head: to + wrapper.length,
      },
    });
    return true;
  };

  const wrapWith = (viewInstance, prefix, suffix) => {
    const { state } = viewInstance;
    const { from, to } = state.selection.main;
    const selectedText = state.doc.sliceString(from, to);
    viewInstance.dispatch({
      changes: { from, to, insert: `${prefix}${selectedText}${suffix}` },
      selection: {
        anchor: from + prefix.length,
        head: to + prefix.length,
      },
    });
    return true;
  };

  const updateSelectedLines = (viewInstance, transformer) => {
    const { state } = viewInstance;
    const { from, to } = state.selection.main;
    const startLine = state.doc.lineAt(from).number;
    const endLine = state.doc.lineAt(to).number;
    const changes = [];
    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
      const line = state.doc.line(lineNumber);
      const nextText = transformer(line.text, lineNumber - startLine);
      if (nextText !== line.text) {
        changes.push({ from: line.from, to: line.to, insert: nextText });
      }
    }
    if (changes.length) {
      viewInstance.dispatch({ changes });
    }
    return true;
  };

  const toggleHeading = (viewInstance, level) =>
    updateSelectedLines(viewInstance, (text) => {
      const cleaned = text.replace(/^#{1,6}\s+/, "");
      return `${"#".repeat(level)} ${cleaned}`;
    });

  const adjustHeading = (viewInstance, delta) =>
    updateSelectedLines(viewInstance, (text) => {
      const match = text.match(/^(#{1,6})\s+/);
      if (!match) {
        return delta > 0 ? `# ${text}` : text;
      }
      const current = match[1].length;
      const next = Math.min(6, Math.max(1, current + delta));
      if (next === current && delta < 0 && current === 1) {
        return text.replace(/^#{1,6}\s+/, "");
      }
      return text.replace(/^#{1,6}\s+/, `${"#".repeat(next)} `);
    });

  const togglePrefix = (viewInstance, prefix, matcher) =>
    updateSelectedLines(viewInstance, (text) => {
      if (matcher.test(text)) {
        return text.replace(matcher, "");
      }
      return `${prefix}${text}`;
    });

  const toggleOrderedList = (viewInstance) =>
    updateSelectedLines(viewInstance, (text, index) => {
      if (/^\s*\d+\.\s+/.test(text)) {
        return text.replace(/^\s*\d+\.\s+/, "");
      }
      return `${index + 1}. ${text}`;
    });

  const toggleTaskList = (viewInstance) =>
    updateSelectedLines(viewInstance, (text) => {
      if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(text)) {
        return text.replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, "");
      }
      return `- [ ] ${text}`;
    });

  const insertCodeBlock = (viewInstance) => {
    if (!viewInstance) return true;
    const { state } = viewInstance;
    const { from, to } = state.selection.main;
    const selectedText = state.doc.sliceString(from, to);
    const block = `\n\`\`\`\n${selectedText}\n\`\`\`\n`;
    viewInstance.dispatch({
      changes: { from, to, insert: block },
      selection: { anchor: from + 5, head: from + 5 + selectedText.length },
    });
    return true;
  };

  const insertLink = (viewInstance) => {
    if (!viewInstance) return true;
    const { state } = viewInstance;
    const { from, to } = state.selection.main;
    const selectedText = state.doc.sliceString(from, to) || "link text";
    const insert = `[${selectedText}](url)`;
    viewInstance.dispatch({
      changes: { from, to, insert },
      selection: {
        anchor: from + selectedText.length + 3,
        head: from + selectedText.length + 6,
      },
    });
    return true;
  };

  const insertImage = (viewInstance) => {
    if (!viewInstance) return true;
    const { state } = viewInstance;
    const { from, to } = state.selection.main;
    const insert = "![alt text](path)";
    viewInstance.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + 2, head: from + 10 },
    });
    return true;
  };

  const insertHorizontalRule = (viewInstance) => {
    if (!viewInstance) return true;
    const { state } = viewInstance;
    const { from } = state.selection.main;
    const line = state.doc.lineAt(from);
    const insert = line.text.trim() ? `${line.text}\n---` : "---";
    viewInstance.dispatch({
      changes: { from: line.from, to: line.to, insert },
      selection: { anchor: line.from + insert.length, head: line.from + insert.length },
    });
    return true;
  };

  onMount(() => {
    if (!tabs.length) {
      const tab = createTab({});
      tabs = [tab];
      activeTabId = tab.id;
    }

    const updateListener = EditorView.updateListener.of((update) => {
      if ((update.docChanged || update.selectionSet) && !suppressChange) {
        updateActiveFromState(update.state);
      }
      if (update.docChanged || update.selectionSet) {
        updateStatus(update.state);
      }
    });

    const shortcuts = [
      // Custom shortcuts FIRST (highest priority - before defaultKeymap)
      {
        key: "Mod-/",
        run: () => {
          togglePreview();
          return true;
        },
      },
      {
        key: "Mod-b",
        run: (viewInstance) => wrapSelection(viewInstance, "**"),
      },
      {
        key: "Mod-i",
        run: (viewInstance) => wrapSelection(viewInstance, "*"),
      },
      {
        key: "Mod-u",
        run: (viewInstance) => wrapWith(viewInstance, "<u>", "</u>"),
      },
      {
        key: "Mod-Shift-s",
        run: (viewInstance) => wrapSelection(viewInstance, "~~"),
      },
      {
        key: "Mod-`",
        run: (viewInstance) => wrapSelection(viewInstance, "`"),
      },
      { key: "Mod-k", run: insertLink },
      { key: "Mod-Shift-i", run: insertImage },
      { key: "Mod-Shift-q", run: (viewInstance) => togglePrefix(viewInstance, "> ", /^\s*>\s+/) },
      { key: "Mod-Shift-u", run: (viewInstance) => togglePrefix(viewInstance, "- ", /^\s*[-*+]\s+/) },
      { key: "Mod-Shift-o", run: (viewInstance) => toggleOrderedList(viewInstance) },
      { key: "Mod-Shift-x", run: (viewInstance) => toggleTaskList(viewInstance) },
      { key: "Mod-Shift--", run: insertHorizontalRule },
      { key: "Mod-Alt-c", run: insertCodeBlock },
      { key: "Mod-1", run: (viewInstance) => toggleHeading(viewInstance, 1) },
      { key: "Mod-2", run: (viewInstance) => toggleHeading(viewInstance, 2) },
      { key: "Mod-3", run: (viewInstance) => toggleHeading(viewInstance, 3) },
      { key: "Mod-4", run: (viewInstance) => toggleHeading(viewInstance, 4) },
      { key: "Mod-5", run: (viewInstance) => toggleHeading(viewInstance, 5) },
      { key: "Mod-6", run: (viewInstance) => toggleHeading(viewInstance, 6) },
      { key: "Mod-=", run: (viewInstance) => adjustHeading(viewInstance, 1) },
      { key: "Mod--", run: (viewInstance) => adjustHeading(viewInstance, -1) },
      { key: "Mod-f", run: openSearchPanel },
      { key: "Mod-Alt-f", run: openSearchPanel },
      {
        key: "Mod-s",
        run: () => {
          saveFile();
          return true;
        },
      },
      {
        key: "Mod-o",
        run: () => {
          openFile();
          return true;
        },
      },
      {
        key: "Mod-t",
        run: () => {
          newTab();
          return true;
        },
      },
      {
        key: "Mod-w",
        run: () => {
          closeTab(activeTabId);
          return true;
        },
      },
      {
        key: "Mod-Shift-[",
        run: () => {
          const index = tabs.findIndex((tab) => tab.id === activeTabId);
          if (index > 0) {
            selectTab(tabs[index - 1].id);
          }
          return true;
        },
      },
      {
        key: "Mod-Shift-]",
        run: () => {
          const index = tabs.findIndex((tab) => tab.id === activeTabId);
          if (index < tabs.length - 1 && index >= 0) {
            selectTab(tabs[index + 1].id);
          }
          return true;
        },
      },
      // Default keymaps AFTER custom shortcuts
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
    ];

    const state = EditorState.create({
      doc: getActiveTab()?.content ?? "",
      extensions: [
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        markdown(),
        syntaxHighlighting(sourceHighlight),
        highlightSelectionMatches(),
        keymap.of(shortcuts),
        updateListener,
        previewCompartment.of(previewMode ? previewExtension : []),
      ],
    });

    view = new EditorView({
      state,
      parent: editorEl,
    });
    updateStatus(view.state);

    const handleGlobalKeys = (event) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === "t") {
        event.preventDefault();
        newTab();
      } else if (event.key === "w") {
        event.preventDefault();
        closeTab(activeTabId);
      }
    };

    window.addEventListener("keydown", handleGlobalKeys);

    return () => {
      window.removeEventListener("keydown", handleGlobalKeys);
    };
  });

  onDestroy(() => {
    view?.destroy();
  });

  $: activeTab = getActiveTab();
  $: saveStatus = activeTab?.dirty ? "Unsaved" : "Saved";
  $: isEmpty = charCount === 0;
</script>

<main class="app">
  <!-- Minimal Header - just drag region and window controls space -->
  <header class="header" data-tauri-drag-region>
    <!-- Tab strip on the left, after traffic lights space -->
    <nav class="tabs">
      {#each tabs as tab (tab.id)}
        <button
          class="tab"
          class:active={tab.id === activeTabId}
          type="button"
          on:click={() => selectTab(tab.id)}
        >
          {#if tab.dirty}
            <span class="tab-dirty"></span>
          {/if}
          <span class="tab-name">{tab.title}</span>
          <span
            class="tab-close"
            role="button"
            tabindex="-1"
            on:click|stopPropagation={() => closeTab(tab.id)}
            on:keydown|stopPropagation={(e) => e.key === 'Enter' && closeTab(tab.id)}
          >×</span>
        </button>
      {/each}
      <button class="tab-add" type="button" on:click={newTab} aria-label="New tab">+</button>
    </nav>

    <!-- Drag region spacer -->
    <div class="drag-region" on:mousedown={() => getCurrentWindow().startDragging()}></div>

    <!-- Minimal actions on the right -->
    <div class="header-actions">
      <button class="header-btn" type="button" on:click={openFile} title="Open (⌘O)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 7v13a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      </button>
      <button class="header-btn" type="button" on:click={saveFile} title="Save (⌘S)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
          <polyline points="17,21 17,13 7,13 7,21" />
          <polyline points="7,3 7,8 15,8" />
        </svg>
      </button>
      <button
        class="header-btn"
        class:active={!previewMode}
        type="button"
        on:click={togglePreview}
        title="Toggle source/preview (⌘/)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <polyline points="4,17 10,11 4,5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      </button>
    </div>
  </header>

  <!-- Editor Area -->
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <section class="editor-shell" on:click={(e) => {
    if (!view) return;
    view.focus();
    // Position cursor at start for empty documents
    if (view.state.doc.length === 0) {
      view.dispatch({ selection: { anchor: 0 } });
    }
  }}>
    <div class="editor-container">
      <!-- CodeMirror Editor -->
      <div class="editor" bind:this={editorEl}></div>
    </div>
  </section>

  <!-- Status Bar -->
  <footer class="statusbar">
    <div class="status-group">
      <span class="status-item">{wordCount} words</span>
      <span class="status-item">{charCount} chars</span>
      <span class="status-item">Ln {cursorLine}, Col {cursorColumn}</span>
    </div>
    <div class="status-group">
      <button
        class="status-mode"
        class:preview={previewMode}
        type="button"
        on:click={togglePreview}
      >
        {previewMode ? "Preview" : "Source"}
      </button>
      <span class="status-save" class:saved={!activeTab?.dirty} class:unsaved={activeTab?.dirty}>
        {#if activeTab?.dirty}
          <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
            <circle cx="12" cy="12" r="6" />
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
            <polyline points="20,6 9,17 4,12" />
          </svg>
        {/if}
        {saveStatus}
      </span>
    </div>
  </footer>
</main>
