// ============================================================
// packages/dom/src/dom-document.ts
// DomDocument — HTML parser using htmlparser2 + custom DOM tree
// ============================================================

import { parseDocument } from 'htmlparser2';
import type { DomNode, DomDocument } from './types';
import { createDomNode, getAttr } from './dom-node';
import { querySelectorAll, querySelector, extractAttribute } from './css-selector';

export function createDomDocument(html: string): DomDocument {
  const raw = parseDocument(html, { decodeEntities: true });
  const root = createDomNode(raw as any, null);

  const doc: DomDocument = {
    root,
    html,
    load(newHtml: string): DomDocument {
      return createDomDocument(newHtml);
    },
    querySelectorAll(selector: string, scope?: DomNode): DomNode[] {
      return querySelectorAll(scope || root, selector);
    },
    querySelector(selector: string, scope?: DomNode): DomNode | null {
      return querySelector(scope || root, selector);
    },
  };

  return doc;
}

/** Parse a JSON API response into a navigable document */
export function createJsonDoc(data: unknown): JsonDocImpl {
  return new JsonDocImpl(data);
}

class JsonDocImpl {
  constructor(public readonly root: unknown) {}

  get(path: string): unknown {
    const keys = path.split('.');
    let val: any = this.root;
    for (const key of keys) {
      if (val && typeof val === 'object' && key in val) {
        val = val[key];
      } else {
        return undefined;
      }
    }
    return val;
  }

  getArray(path: string): unknown[] {
    const val = this.get(path);
    return Array.isArray(val) ? val : [];
  }
}

export { getAttr, extractAttribute, querySelectorAll as queryAll };
