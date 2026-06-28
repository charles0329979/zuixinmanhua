// ============================================================
// packages/dom/src/index.ts
// Barrel export — @zuixinmanhua/dom
// ============================================================

export type { DomNode, DomDocument, JsonDoc } from './types';
export { createDomDocument, createJsonDoc, getAttr, extractAttribute, queryAll } from './dom-document';
export { createDomNode } from './dom-node';
export { querySelectorAll, querySelector, extractAttribute as extractAttrBySelector } from './css-selector';
