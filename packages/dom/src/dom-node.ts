// ============================================================
// packages/dom/src/dom-node.ts
// Lightweight DOM node — wraps htmlparser2 output
// ============================================================

import type { DomNode } from './types';

interface RawNode {
  type: string;
  name: string;
  attribs: Record<string, string>;
  children: RawNode[];
  data?: string;
  parent?: RawNode;
}

export function createDomNode(raw: RawNode, parent: DomNode | null = null): DomNode {
  const children: DomNode[] = (raw.children || [])
    .filter((c) => c.type === 'tag' || c.type === 'script' || c.type === 'style')
    .map((c) => createDomNode(c, null))
    .filter(Boolean);

  // Re-bind parent references
  for (const child of children) {
    (child as any)._parent = null; // will be set below
  }

  const textChildren = (raw.children || [])
    .filter((c) => c.type === 'text')
    .map((c) => c.data || '')
    .join('');

  const childText = textChildren.trim();

  // Build textContent recursively
  const allText: string[] = [];
  for (const c of raw.children || []) {
    if (c.type === 'text') {
      allText.push(c.data || '');
    } else if (c.type === 'tag') {
      const sub = createDomNode(c, null);
      allText.push(sub.textContent);
    }
  }
  const textContent = allText.join('').trim();

  // Build innerHTML
  const innerParts: string[] = [];
  for (const c of raw.children || []) {
    if (c.type === 'text') {
      innerParts.push(c.data || '');
    } else if (c.type === 'tag') {
      innerParts.push(rawToHTML(c));
    }
  }
  const innerHTML = innerParts.join('');

  const node: DomNode = {
    tagName: raw.name || '',
    attrs: { ...(raw.attribs || {}) },
    children,
    parent,
    textContent,
    innerHTML,
    childText,
  };

  // Set parent on children
  for (const child of children) {
    (child as any)._parent = node;
  }

  return node;
}

function rawToHTML(raw: RawNode): string {
  if (raw.type === 'text') return raw.data || '';
  const attrs = Object.entries(raw.attribs || {})
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('');
  const inner = (raw.children || []).map(rawToHTML).join('');
  const voidTags = ['img','br','hr','input','meta','link','area','base','col','embed','source','track','wbr'];
  if (voidTags.includes(raw.name || '')) {
    return `<${raw.name}${attrs}>`;
  }
  return `<${raw.name}${attrs}>${inner}</${raw.name}>`;
}

/** Get attribute with Legado @attr syntax support */
export function getAttr(node: DomNode, attr: string): string {
  if (attr === 'text' || attr === 'textContent') return node.textContent;
  if (attr === 'html' || attr === 'innerHTML') return node.innerHTML;
  if (attr === 'childText') return node.childText;
  return node.attrs[attr] || '';
}
