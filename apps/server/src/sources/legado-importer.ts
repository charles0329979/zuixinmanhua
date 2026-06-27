import axios from "axios";
import type { MangaSource } from "./source-store";
import { sourceStore } from "./source-store";

interface LegadoSource {
  bookSourceName?: string; bookSourceUrl?: string; bookSourceType?: number;
  bookSourceGroup?: string; enabled?: boolean; weight?: number;
  searchUrl?: string; header?: Record<string, string>;
  ruleSearch?: Record<string, any>; ruleBookInfo?: Record<string, any>;
  ruleToc?: Record<string, any>; ruleContent?: Record<string, any>;
  respondTime?: number;
}

function parseSelector(raw) {
  if (!raw) return { selector: "", attr: "text" };
  if (raw.startsWith("@js:") || raw.includes("@js:")) return { selector: raw, attr: "js" };
  var atIdx = raw.lastIndexOf("@");
  if (atIdx > 0 && raw.charAt(atIdx - 1) !== "@") return { selector: raw.slice(0, atIdx), attr: raw.slice(atIdx + 1) || "text" };
  return { selector: raw, attr: "text" };
}

function generateId(url) {
  var hash = 0;
  for (var i = 0; i < url.length; i++) { hash = ((hash << 5) - hash) + url.charCodeAt(i); hash |= 0; }
  return "lg-" + Math.abs(hash).toString(36);
}

function hasJsExpr(obj) {
  for (var k in obj) { if (typeof obj[k] === "string" && (obj[k].startsWith("@js:") || obj[k].includes("@js:"))) return true; }
  return false;
}

export function convertLegadoToMangaSource(raw) {
  var name = raw.bookSourceName || "";
  var host = raw.bookSourceUrl || "";
  if (!host) return null;
  var id = generateId(host);
  var s = raw.ruleSearch || {};
  var d = raw.ruleBookInfo || {};
  var c = raw.ruleToc || {};
  var img = raw.ruleContent || {};
  var hasJs = hasJsExpr(Object.assign({}, s, d, c, img));
  var isManga = raw.bookSourceType === 2 || (raw.bookSourceGroup || "").includes("漫画");
  var source: MangaSource = {
    id: id, name: name.slice(0, 50), host: host,
    enabled: raw.enabled !== false, language: "zh",
    weight: raw.weight || (isManga ? 50 : 0),
    tags: [raw.bookSourceGroup || "Legado"].filter(Boolean),
    mode: "server",
    search: {
      url: raw.searchUrl || "/search?keyword={{keyword}}",
      method: "GET", responseType: "html",
      listSelector: parseSelector(s.bookList || "").selector || "body",
      titleSelector: parseSelector(s.name || "").selector || "h1",
      coverSelector: parseSelector(s.coverUrl || "").selector || "img",
      detailUrlSelector: parseSelector(s.bookUrl || "").selector || "a",
      latestChapterSelector: parseSelector(s.lastChapter || "").selector || undefined,
      statusSelector: undefined, updateTimeSelector: undefined,
    },
    detail: {
      titleSelector: parseSelector(d.name || "").selector || "title",
      coverSelector: parseSelector(d.coverUrl || "").selector || undefined,
      authorSelector: parseSelector(d.author || "").selector || undefined,
      descriptionSelector: parseSelector(d.intro || "").selector || undefined,
      statusSelector: parseSelector(d.kind || "").selector || undefined,
      latestChapterSelector: undefined,
    },
    chapters: {
      listSelector: parseSelector(c.chapterList || "").selector || "li",
      titleSelector: parseSelector(c.chapterName || "").selector || "a",
      urlSelector: parseSelector(c.chapterUrl || "").selector || "a",
    },
    images: {
      listSelector: parseSelector(img.content || "").selector || "img",
      srcAttribute: parseSelector(img.content || "").attr === "js" ? "src" : parseSelector(img.content || "").attr || "src",
    },
    headers: raw.header || undefined,
    timeoutMs: raw.respondTime ? Math.min(raw.respondTime, 15000) : undefined,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  if (hasJs) {
    (source as any).jsRules = { engine: "quickjs", script: "function search(args){return[];}function getComicDetail(args){return{comicId:args.comicId,title:'',cover:''};}function getChapters(args){return[];}function getChapterImages(args){return{chapterId:args.chapterId,images:[]};}", timeoutMs: 8000, memoryLimitMb: 16 };
  }
  return source;
}

export async function fetchAndImport(repoUrl, filterType) {
  var axiosMod = await import("axios");
  var resp = await axiosMod.default.get(repoUrl, { timeout: 60000, responseType: "json" });
  var rawSources = Array.isArray(resp.data) ? resp.data : [];
  var imported = 0, skipped = 0;
  var converted: MangaSource[] = [];
  for (var i = 0; i < rawSources.length; i++) {
    var raw = rawSources[i];
    if (filterType !== undefined && raw.bookSourceType !== filterType) {
      if (!(raw.bookSourceGroup || "").includes("漫画")) { skipped++; continue; }
    }
    var source = convertLegadoToMangaSource(raw);
    if (source) { converted.push(source); imported++; } else { skipped++; }
  }
  if (converted.length > 0) { sourceStore.importSources(converted); }
  return { total: rawSources.length, imported: imported, skipped: skipped };
}