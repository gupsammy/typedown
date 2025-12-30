import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import { openUrl } from "@tauri-apps/plugin-opener";

// ZeroWidthWidget: Uses zero-width space to maintain text flow while being invisible
// This fixes cursor positioning issues that occurred with font-size:0 CSS approach
class ZeroWidthWidget extends WidgetType {
  toDOM() {
    const span = document.createElement("span");
    span.className = "td-zero-width";
    span.textContent = "\u200B"; // Zero-width space - invisible but maintains text flow
    return span;
  }
  eq() {
    return true;
  }
  ignoreEvent() {
    return true;
  }
}

class TextWidget extends WidgetType {
  constructor(text, className) {
    super();
    this.text = text;
    this.className = className;
  }
  eq(other) {
    return other.text === this.text && other.className === this.className;
  }
  toDOM() {
    const span = document.createElement("span");
    span.textContent = this.text;
    if (this.className) {
      span.className = this.className;
    }
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

class ImageWidget extends WidgetType {
  constructor(src, alt) {
    super();
    this.src = src;
    this.alt = alt;
  }
  eq(other) {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "td-image-wrap";
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt || "";
    wrap.appendChild(img);
    if (this.alt) {
      const caption = document.createElement("span");
      caption.className = "td-image-caption";
      caption.textContent = this.alt;
      wrap.appendChild(caption);
    }
    return wrap;
  }
}

class HrWidget extends WidgetType {
  toDOM() {
    const hr = document.createElement("hr");
    hr.className = "td-hr";
    return hr;
  }
  eq() {
    return true;
  }
  ignoreEvent() {
    return true;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(checked, from, to) {
    super();
    this.checked = checked;
    this.from = from;
    this.to = to;
  }
  eq(other) {
    return other.checked === this.checked && other.from === this.from && other.to === this.to;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "td-checkbox";
    span.dataset.taskFrom = String(this.from);
    span.dataset.taskTo = String(this.to);
    span.dataset.taskChecked = this.checked ? "true" : "false";
    const box = document.createElement("span");
    box.className = "td-checkbox-box";
    box.textContent = this.checked ? "☑" : "☐";
    span.appendChild(box);
    return span;
  }
  ignoreEvent() {
    return false;
  }
}

const zeroWidthWidget = new ZeroWidthWidget();

const headingRe = /^(#{1,6})\s+/;
const hrRe = /^(\*{3,}|-{3,}|_{3,})\s*$/;
const blockquoteRe = /^>\s?/;
const taskRe = /^(\s*)[-*+]\s+\[( |x|X)\]\s+/;
const orderedRe = /^(\s*)(\d+)\.\s+/;
const unorderedRe = /^(\s*)([-*+])\s+/;
const fenceRe = /^```/;

const codeSpanRe = /`([^`\n]+)`/g;
const imageRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
const linkRe = /\[([^\]]*)\]\(([^)]+)\)/g;
const strongRe = /\*\*([^*\n]+)\*\*/g;
const strikeRe = /~~([^~\n]+)~~/g;
const emRe = /\*(?!\*)(\S(?:[^*\n]*\S)?)\*/g;

// Check if cursor/selection is near a range (for expand-on-focus)
// Uses a gentle proximity zone so syntax reveals before you're inside it
function selectionIntersects(selection, from, to) {
  const selFrom = selection.main.from;
  const selTo = selection.main.to;
  // Expand the check zone by a few characters on each side
  // This makes syntax reveal as cursor approaches, not just when inside
  const proximityZone = 1;
  return selFrom <= to + proximityZone && selTo >= from - proximityZone;
}

function overlaps(ranges, from, to) {
  return ranges.some(([a, b]) => from < b && to > a);
}

function addInlineDecorations(decos, base, text, selection, occupied) {
  const shouldSkip = (start, end) => {
    return selectionIntersects(selection, start, end) || overlaps(occupied, start, end);
  };

  // Code spans (highest priority - process first)
  for (const match of text.matchAll(codeSpanRe)) {
    const start = base + match.index;
    const end = start + match[0].length;
    if (shouldSkip(start, end)) continue;
    occupied.push([start, end]);
    const contentStart = start + 1;
    const contentEnd = end - 1;
    decos.push({ from: start, to: start + 1, deco: Decoration.replace({ widget: zeroWidthWidget }) });
    decos.push({ from: end - 1, to: end, deco: Decoration.replace({ widget: zeroWidthWidget }) });
    decos.push({ from: contentStart, to: contentEnd, deco: Decoration.mark({ class: "td-inline-code" }) });
  }

  // Images
  for (const match of text.matchAll(imageRe)) {
    const start = base + match.index;
    const end = start + match[0].length;
    if (shouldSkip(start, end)) continue;
    occupied.push([start, end]);
    const alt = match[1];
    const src = match[2];
    decos.push({ from: start, to: end, deco: Decoration.replace({ widget: new ImageWidget(src, alt) }) });
  }

  // Links (skip if preceded by ! which makes it an image)
  for (const match of text.matchAll(linkRe)) {
    if (match.index > 0 && text[match.index - 1] === "!") continue;
    const start = base + match.index;
    const end = start + match[0].length;
    if (shouldSkip(start, end)) continue;
    occupied.push([start, end]);
    const label = match[1];
    const url = match[2];

    if (label.length === 0) {
      // Empty link text: handle anchor links and external links differently
      if (url.startsWith("#")) {
        // Anchor link [](#anchor) - hide completely
        decos.push({ from: start, to: end, deco: Decoration.replace({ widget: zeroWidthWidget }) });
      } else {
        // External link with no text [](url) - show URL as clickable text
        const displayUrl = url.replace(/^https?:\/\//, "");
        decos.push({
          from: start,
          to: end,
          deco: Decoration.replace({ widget: new TextWidget(displayUrl, "td-link") }),
        });
      }
    } else {
      // Normal link with label
      const labelStart = start + 1;
      const labelEnd = labelStart + label.length;
      decos.push({ from: start, to: start + 1, deco: Decoration.replace({ widget: zeroWidthWidget }) });
      decos.push({ from: labelEnd, to: end, deco: Decoration.replace({ widget: zeroWidthWidget }) });
      decos.push({ from: labelStart, to: labelEnd, deco: Decoration.mark({ class: "td-link", attributes: { "data-href": url, title: url } }) });
    }
  }

  // Strong (bold)
  for (const match of text.matchAll(strongRe)) {
    const start = base + match.index;
    const end = start + match[0].length;
    if (shouldSkip(start, end)) continue;
    occupied.push([start, end]);
    decos.push({ from: start, to: start + 2, deco: Decoration.replace({ widget: zeroWidthWidget }) });
    decos.push({ from: end - 2, to: end, deco: Decoration.replace({ widget: zeroWidthWidget }) });
    decos.push({ from: start + 2, to: end - 2, deco: Decoration.mark({ class: "td-strong" }) });
  }

  // Strikethrough
  for (const match of text.matchAll(strikeRe)) {
    const start = base + match.index;
    const end = start + match[0].length;
    if (shouldSkip(start, end)) continue;
    occupied.push([start, end]);
    decos.push({ from: start, to: start + 2, deco: Decoration.replace({ widget: zeroWidthWidget }) });
    decos.push({ from: end - 2, to: end, deco: Decoration.replace({ widget: zeroWidthWidget }) });
    decos.push({ from: start + 2, to: end - 2, deco: Decoration.mark({ class: "td-strike" }) });
  }

  // Emphasis (italic)
  for (const match of text.matchAll(emRe)) {
    const start = base + match.index;
    const end = start + match[0].length;
    if (shouldSkip(start, end)) continue;
    occupied.push([start, end]);
    decos.push({ from: start, to: start + 1, deco: Decoration.replace({ widget: zeroWidthWidget }) });
    decos.push({ from: end - 1, to: end, deco: Decoration.replace({ widget: zeroWidthWidget }) });
    decos.push({ from: start + 1, to: end - 1, deco: Decoration.mark({ class: "td-em" }) });
  }
}

/** @returns {import("@codemirror/view").DecorationSet} */
function buildDecorations(view) {
  const { doc, selection } = view.state;
  let inCodeBlock = false;

  // First pass: collect code block ranges for expand-on-focus
  const codeBlockRanges = [];
  let blockStart = null;
  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
    const line = doc.line(lineNumber);
    if (fenceRe.test(line.text)) {
      if (blockStart === null) {
        blockStart = line.from; // Opening fence
      } else {
        codeBlockRanges.push([blockStart, line.to]); // Complete block
        blockStart = null;
      }
    }
  }

  // Collect all decorations first, then sort and add
  const lineDecos = []; // Line decorations (added at position 0 of line)
  const rangeDecos = []; // Range decorations (replace/mark)

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    const text = line.text;
    const lineFrom = line.from;
    const lineTo = line.to;
    const occupied = [];
    let inlineStart = 0;

    if (fenceRe.test(text)) {
      // Find the code block range that contains this fence
      const blockRange = codeBlockRanges.find(([start, end]) =>
        lineFrom >= start && lineTo <= end
      );

      const cursorInBlock = blockRange &&
        selectionIntersects(selection, blockRange[0], blockRange[1]);

      if (cursorInBlock) {
        // Show fence with visible styling when cursor is in the code block
        lineDecos.push({ from: lineFrom, deco: Decoration.line({ class: "td-code-fence-line td-fence-editing" }) });
        rangeDecos.push({ from: lineFrom, to: lineTo, deco: Decoration.mark({ class: "td-fence-syntax" }) });
      } else {
        // Collapse fence to minimal height - use mark decoration to preserve coordinates
        lineDecos.push({ from: lineFrom, deco: Decoration.line({ class: "td-code-fence-line" }) });
        rangeDecos.push({ from: lineFrom, to: lineTo, deco: Decoration.mark({ class: "td-fence-collapsed" }) });
      }
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      lineDecos.push({ from: lineFrom, deco: Decoration.line({ class: "td-code-line" }) });
      continue;
    }

    if (hrRe.test(text)) {
      if (!selectionIntersects(selection, lineFrom, lineTo)) {
        rangeDecos.push({ from: lineFrom, to: lineTo, deco: Decoration.replace({ widget: new HrWidget() }) });
      } else {
        // When cursor is on line, show syntax with muted styling
        rangeDecos.push({ from: lineFrom, to: lineTo, deco: Decoration.mark({ class: "td-hr-syntax" }) });
      }
      continue;
    }

    const headingMatch = text.match(headingRe);
    if (headingMatch) {
      const level = headingMatch[1].length;
      inlineStart = headingMatch[0].length;
      lineDecos.push({ from: lineFrom, deco: Decoration.line({ class: `td-heading-line td-h${level}` }) });
      // Reveal heading syntax when cursor is anywhere on the line
      if (!selectionIntersects(selection, lineFrom, lineTo)) {
        rangeDecos.push({ from: lineFrom, to: lineFrom + inlineStart, deco: Decoration.replace({ widget: zeroWidthWidget }) });
      }
    }

    const blockquoteMatch = text.match(blockquoteRe);
    if (blockquoteMatch) {
      const markerLength = blockquoteMatch[0].length;
      inlineStart = Math.max(inlineStart, markerLength);
      lineDecos.push({ from: lineFrom, deco: Decoration.line({ class: "td-blockquote-line" }) });
      // Reveal blockquote syntax when cursor is anywhere on the line
      if (!selectionIntersects(selection, lineFrom, lineTo)) {
        rangeDecos.push({ from: lineFrom, to: lineFrom + markerLength, deco: Decoration.replace({ widget: zeroWidthWidget }) });
      }
    }

    const taskMatch = text.match(taskRe);
    if (taskMatch) {
      const indentLength = taskMatch[1].length;
      const markerLength = taskMatch[0].length;
      const markerFrom = lineFrom + indentLength;
      const markerTo = lineFrom + markerLength;
      const boxIndex = text.indexOf("[");
      const boxFrom = lineFrom + boxIndex;
      const boxTo = boxFrom + 3;
      inlineStart = Math.max(inlineStart, markerLength);
      // Reveal task syntax when cursor is anywhere on the line
      if (!selectionIntersects(selection, lineFrom, lineTo)) {
        rangeDecos.push({
          from: markerFrom,
          to: markerTo,
          deco: Decoration.replace({ widget: new CheckboxWidget(taskMatch[2].toLowerCase() === "x", boxFrom, boxTo) }),
        });
      }
      lineDecos.push({ from: lineFrom, deco: Decoration.line({ class: "td-list-line td-task-line" }) });
    } else {
      const orderedMatch = text.match(orderedRe);
      if (orderedMatch) {
        const indentLength = orderedMatch[1].length;
        const markerLength = orderedMatch[0].length;
        const markerFrom = lineFrom + indentLength;
        const markerTo = lineFrom + markerLength;
        inlineStart = Math.max(inlineStart, markerLength);
        // Reveal list syntax when cursor is anywhere on the line
        if (!selectionIntersects(selection, lineFrom, lineTo)) {
          rangeDecos.push({
            from: markerFrom,
            to: markerTo,
            deco: Decoration.replace({ widget: new TextWidget(`${orderedMatch[2]}.`, "td-list-number") }),
          });
        }
        lineDecos.push({ from: lineFrom, deco: Decoration.line({ class: "td-list-line" }) });
      }

      const unorderedMatch = text.match(unorderedRe);
      if (unorderedMatch) {
        const indentLength = unorderedMatch[1].length;
        const markerLength = unorderedMatch[0].length;
        const markerFrom = lineFrom + indentLength;
        const markerTo = lineFrom + markerLength;
        inlineStart = Math.max(inlineStart, markerLength);
        // Reveal list syntax when cursor is anywhere on the line
        if (!selectionIntersects(selection, lineFrom, lineTo)) {
          rangeDecos.push({
            from: markerFrom,
            to: markerTo,
            deco: Decoration.replace({ widget: new TextWidget("•", "td-list-bullet") }),
          });
        }
        lineDecos.push({ from: lineFrom, deco: Decoration.line({ class: "td-list-line" }) });
      }
    }

    const inlineText = text.slice(inlineStart);
    if (inlineText) {
      addInlineDecorations(rangeDecos, lineFrom + inlineStart, inlineText, selection, occupied);
    }
  }

  // Combine all decorations into one array with a type flag
  const allDecos = [
    ...lineDecos.map(d => ({ ...d, to: d.from, isLine: true })),
    ...rangeDecos.map(d => ({ ...d, isLine: false }))
  ];

  // Sort by position: first by 'from', then line decos before range decos at same position, then by 'to'
  allDecos.sort((a, b) => {
    if (a.from !== b.from) return a.from - b.from;
    if (a.isLine !== b.isLine) return a.isLine ? -1 : 1; // Line decos first
    return a.to - b.to;
  });

  // Build the final decoration set
  /** @type {RangeSetBuilder<Decoration>} */
  const builder = new RangeSetBuilder();
  for (const { from, to, deco } of allDecos) {
    builder.add(from, to, deco);
  }

  return builder.finish();
}

const previewPlugin = ViewPlugin.fromClass(
  class {
    /** @type {import("@codemirror/view").DecorationSet} */
    decorations;
    constructor(view) {
      this.decorations = buildDecorations(view);
    }
    update(update) {
      if (update.docChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations,
  }
);

const previewEvents = EditorView.domEventHandlers({
  // Mousedown triggers a view update which rebuilds decorations
  // This ensures syntax reveals immediately when clicking, not after
  mousedown(event, view) {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });

    // Handle empty document - position cursor at start
    if (pos === null) {
      if (view.state.doc.length === 0) {
        requestAnimationFrame(() => {
          view.dispatch({
            selection: { anchor: 0 },
            scrollIntoView: false,
          });
        });
      }
      return false;
    }

    // Capture shift state now since event may change by requestAnimationFrame
    const isShiftClick = event.shiftKey;
    const currentAnchor = view.state.selection.main.anchor;

    // Use requestAnimationFrame to let the click register first
    requestAnimationFrame(() => {
      if (view.state.doc.length < pos) return;

      if (isShiftClick) {
        // Extend selection from current anchor to clicked position
        view.dispatch({
          selection: { anchor: currentAnchor, head: pos },
          scrollIntoView: false,
        });
      } else {
        // Normal click - set cursor position for expand-on-focus
        view.dispatch({
          selection: { anchor: pos },
          scrollIntoView: false,
        });
      }
    });

    return false;
  },
  click(event, view) {
    const target = /** @type {HTMLElement|null} */ (event.target);
    const linkTarget = target?.closest?.("[data-href]");
    if (linkTarget) {
      const href = linkTarget.getAttribute("data-href");
      if (href && (event.metaKey || event.ctrlKey)) {
        openUrl(href);
        return true;
      }
      return false;
    }

    const taskTarget = target?.closest?.("[data-task-from]");
    if (taskTarget) {
      const from = Number(taskTarget.getAttribute("data-task-from"));
      const to = Number(taskTarget.getAttribute("data-task-to"));
      const checked = taskTarget.getAttribute("data-task-checked") === "true";
      if (Number.isFinite(from) && Number.isFinite(to)) {
        view.dispatch({
          changes: { from, to, insert: checked ? "[ ]" : "[x]" },
        });
        return true;
      }
    }

    return false;
  },
});

export const previewExtension = [previewPlugin, previewEvents];
