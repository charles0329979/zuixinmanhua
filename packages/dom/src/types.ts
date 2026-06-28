// ============================================================
// packages/dom/src/types.ts
// DOM types — platform-independent
// ============================================================

/** A lightweight DOM node (replaces cheerio Cheerio<Element>) */
export interface DomNode {
  readonly tagName: string;
  readonly attrs: Record<string, string>;
  readonly children: DomNode[];
  readonly parent: DomNode | null;
  /** Inner text content (all descendant text concatenated) */
  readonly textContent: string;
  /** Inner HTML markup */
  readonly innerHTML: string;
  /** Direct child text (not including element children) */
  readonly childText: string;
}

/** The parsed document root (replaces cheerio CheerioAPI) */
export interface DomDocument {
  /** Root node (usually <html> or the document) */
  readonly root: DomNode;
  /** CSS selector query — returns all matching descendants */
  querySelectorAll(selector: string, scope?: DomNode): DomNode[];
  /** CSS selector query — returns first match */
  querySelector(selector: string, scope?: DomNode): DomNode | null;
  /** Parse HTML string into document */
  load(html: string): DomDocument;
  /** Get the raw HTML string */
  readonly html: string;
}

/** Parsed JSON document for JSONPath-style queries */
export interface JsonDoc {
  readonly root: unknown;
  /** Navigate a dot-separated path like "data.items" */
  get(path: string): unknown;
  /** Get array at path */
  getArray(path: string): unknown[];
}
