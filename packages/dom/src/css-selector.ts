// ============================================================
// packages/dom/src/css-selector.ts
// Minimal CSS selector engine — covers comic-reader source usage
// Supports: tag, .class, #id, [attr], [attr=value], space, >, ||, @attr
// ============================================================

import type { DomNode } from './types';

interface ParsedSelector {
  /** Individual selector parts chain (AND logic within, space=descendant) */
  parts: SelectorPart[];
  /** Attribute to extract (Legado @attr syntax, e.g. "a@href") */
  extractAttr?: string;
}

interface SelectorPart {
  tag?: string;
  classes: string[];
  id?: string;
  attrs: { name: string; value?: string }[];
  combinator: ' ' | '>' | ''; // '' = first part
  pseudoClass?: string; // :first, :last, :nth-child(N)
}

/** Parse a CSS selector string into structured parts */
function parseSelector(raw: string): ParsedSelector {
  let selector = raw.trim();
  let extractAttr: string | undefined;

  // Legado @attr syntax: "selector@attr"
  const atIdx = selector.lastIndexOf('@');
  if (atIdx > 0 && !selector.substring(atIdx).includes(']') && !selector.substring(atIdx).includes(' ')) {
    extractAttr = selector.substring(atIdx + 1).trim();
    selector = selector.substring(0, atIdx).trim();
  }

  // Split by combinator: spaces and >
  const parts: SelectorPart[] = [];
  const tokens = selector.split(/(\s+|\s*>\s*)/).filter(Boolean);

  let currentPart: SelectorPart = { classes: [], attrs: [], combinator: '' };
  let expectCombinator = false;

  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;

    if (trimmed === '>' || trimmed === '') {
      if (trimmed === '>') {
        // Flush current, mark next with child combinator
        if (currentPart.tag || currentPart.classes.length > 0 || currentPart.id) {
          parts.push(currentPart);
        }
        currentPart = { classes: [], attrs: [], combinator: '>' };
        expectCombinator = false;
      }
      continue;
    }

    if (expectCombinator && currentPart.combinator === '') {
      // Space combinator between parts
      currentPart.combinator = ' ';
    }

    // Parse the token
    const parsed = parseSelectorToken(trimmed);
    if (parsed) {
      if (!currentPart.tag && !currentPart.id && currentPart.classes.length === 0 && currentPart.attrs.length === 0) {
        // First token of a new part
        currentPart = { ...parsed, combinator: currentPart.combinator || '' };
      } else {
        // Additional constraints on same part (e.g., "div.class")
        if (parsed.tag) currentPart.tag = parsed.tag;
        currentPart.classes.push(...parsed.classes);
        if (parsed.id) currentPart.id = parsed.id;
        currentPart.attrs.push(...parsed.attrs);
      }
      expectCombinator = false;
    }

    // Check if this was a combinator (space)
    if (token.match(/^\s+$/)) {
      expectCombinator = true;
    }
  }

  if (currentPart.tag || currentPart.classes.length > 0 || currentPart.id || currentPart.attrs.length > 0) {
    parts.push(currentPart);
  }

  // Clean up: if no parts, create a wildcard
  if (parts.length === 0) {
    parts.push({ classes: [], attrs: [], combinator: '' });
  }

  return { parts, extractAttr };
}

function parseSelectorToken(token: string): SelectorPart | null {
  const part: SelectorPart = { classes: [], attrs: [], combinator: '' };
  let remaining = token;

  // :pseudo-classes
  const pseudoMatch = remaining.match(/^:([a-zA-Z-]+(?:\([^)]*\))?)/);
  if (pseudoMatch) {
    part.pseudoClass = pseudoMatch[1];
    remaining = remaining.substring(pseudoMatch[0].length);
    if (!remaining) return part;
  }

  // #id
  const idMatch = remaining.match(/#([a-zA-Z_][\w-]*)/);
  if (idMatch) {
    part.id = idMatch[1];
    remaining = remaining.replace(idMatch[0], '');
  }

  // [attr] or [attr=value] or [attr*="value"]
  const attrRegex = /\[([a-zA-Z_][\w-]*)(?:([*^$~|!]?=)\s*(['"])([^'"]*)\3)?\]/g;
  let attrMatch;
  while ((attrMatch = attrRegex.exec(token)) !== null) {
    part.attrs.push({ name: attrMatch[1], value: attrMatch[4] || '' });
  }
  remaining = remaining.replace(/\[[^\]]*\]/g, '');

  // .class
  const classRegex = /\.([a-zA-Z_][\w-]*)/g;
  let classMatch;
  while ((classMatch = classRegex.exec(remaining)) !== null) {
    part.classes.push(classMatch[1]);
  }
  remaining = remaining.replace(/\.[a-zA-Z_][\w-]*/g, '');

  // tag name
  const tagMatch = remaining.match(/^([a-zA-Z_][\w-]*)/);
  if (tagMatch) {
    part.tag = tagMatch[1].toLowerCase();
  }

  return part;
}

function matchesPart(node: DomNode, part: SelectorPart): boolean {
  if (part.tag && node.tagName.toLowerCase() !== part.tag) return false;
  if (part.id && node.attrs['id'] !== part.id) return false;
  for (const cls of part.classes) {
    const nodeClass = node.attrs['class'] || '';
    if (!nodeClass.split(/\s+/).includes(cls)) return false;
  }
  for (const attr of part.attrs) {
    if (!(attr.name in node.attrs)) return false;
    if (attr.value) {
      const v = node.attrs[attr.name] || '';
      if (attr.name === 'class') {
        if (!v.split(/\s+/).includes(attr.value)) return false;
      } else if (v !== attr.value) {
        return false;
      }
    }
  }
  return true;
}

function* matchDescendants(node: DomNode, part: SelectorPart): Generator<DomNode> {
  if (matchesPart(node, part)) yield node;
  for (const child of node.children) {
    yield* matchDescendants(child, part);
  }
}

function* matchChildren(node: DomNode, part: SelectorPart): Generator<DomNode> {
  for (const child of node.children) {
    if (matchesPart(child, part)) yield child;
  }
}

interface MatchState {
  partIdx: number;
  node: DomNode;
}

function* matchSelectorChain(root: DomNode, parts: SelectorPart[]): Generator<DomNode> {
  if (parts.length === 0) return;

  const firstPart = parts[0];
  const restParts = parts.slice(1);

  // Find all matches for first part
  const candidates: { node: DomNode; parent: DomNode | null }[] = [];
  for (const match of matchDescendants(root, firstPart)) {
    candidates.push({ node: match, parent: (match as any)._parent || null });
  }

  // Filter by subsequent parts using combinators
  for (const candidate of candidates) {
    let valid = true;
    let current: DomNode | null = candidate.node;

    for (let i = 0; i < restParts.length; i++) {
      const part = restParts[i];
      if (!part) break;

      if (part.combinator === '>') {
        // Child combinator: look among children of current
        let found = false;
        const kids = current ? current.children : [];
        for (let j = 0; j < kids.length; j++) {
          const child: DomNode = kids[j]!;
          if (matchesPart(child, restParts[i]!)) {
            current = child as DomNode;
            found = true;
            break;
          }
        }
        if (!found) { valid = false; break; }
      } else {
        // Descendant combinator (space): look among all descendants
        let found = false;
        const descIter = matchDescendants(current!, restParts[i]!);
        for (const desc of descIter) {
          current = desc as DomNode;
          found = true;
          break;
        }
        if (!found) { valid = false; break; }
      }
    }

    if (valid) yield candidate.node;
  }
}

/** Query CSS selector, return matching nodes */
export function querySelectorAll(root: DomNode, selector: string): DomNode[] {
  const results: DomNode[] = [];
  const seen = new Set<DomNode>();

  // Handle Legado || fallback
  const parts = selector.split('||');

  for (const part of parts) {
    const parsed = parseSelector(part.trim());
    const nodes = [...matchSelectorChain(root, parsed.parts)];

    for (const node of nodes) {
      if (!seen.has(node)) {
        seen.add(node);
        results.push(node);
      }
    }
    if (results.length > 0) break; // First non-empty part wins
  }

  return results;
}

/** Query first matching node */
export function querySelector(root: DomNode, selector: string): DomNode | null {
  const results = querySelectorAll(root, selector);
  return results[0] || null;
}

/** Extract attribute using Legado @attr syntax */
export function extractAttribute(node: DomNode, selectorWithAttr: string): string {
  const parsed = parseSelector(selectorWithAttr);
  if (!parsed.extractAttr) return '';

  const match = querySelector(node, selectorWithAttr.replace(/@[^@\s||]+$/, ''));
  if (!match) return '';

  if (parsed.extractAttr === 'text' || parsed.extractAttr === 'textContent') {
    return match.textContent;
  }
  if (parsed.extractAttr === 'html' || parsed.extractAttr === 'innerHTML') {
    return match.innerHTML;
  }
  return match.attrs[parsed.extractAttr] || '';
}
