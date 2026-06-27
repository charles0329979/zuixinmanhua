import axios from "axios";
import type { MangaSource } from "./source-store";
import { sourceStore } from "./source-store";
import { convertLegadoCss, splitLegadoSelector } from "./legado-runner";

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

  // Convert Legado CSS selectors to standard CSS
  var listCss = convertLegadoCss(s.bookList || "");
  var titleCss = convertLegadoCss(s.name || "");
  var coverCss = convertLegadoCss(s.coverUrl || "");
  var urlCss = convertLegadoCss(s.bookUrl || "");
  var authCss = convertLegadoCss(s.author || "");
  var lastCss = convertLegadoCss(s.lastChapter || "");
  var detTitleCss = convertLegadoCss(d.name || "");
  var detCoverCss = convertLegadoCss(d.coverUrl || "");
  var detAuthCss = convertLegadoCss(d.author || "");
  var detDescCss = convertLegadoCss(d.intro || "");
  var chListCss = convertLegadoCss(c.chapterList || "");
  var chNameCss = convertLegadoCss(c.chapterName || "");
  var chUrlCss = convertLegadoCss(c.chapterUrl || "");
  var imgCss = convertLegadoCss(img.content || "");

  // Use responseType:'json' if searchUrl has {{key}} without {{page}} pattern (JSON API)
  var isJsonSearch = raw.searchUrl && raw.searchUrl.includes("{{key}}") && !raw.searchUrl.includes("{{page}}");

  var source: MangaSource = {
    id: id, name: name.slice(0, 50), host: host,
    enabled: raw.enabled !== false, language: "zh",
    weight: raw.weight || (isManga ? 50 : 0),
    tags: [raw.bookSourceGroup || "Legado"].filter(Boolean),
    mode: "server",
    search: {
      url: raw.searchUrl || "/search?keyword={{keyword}}",
      method: "GET",
      responseType: isJsonSearch ? "json" : "html",
      listSelector: listCss.cssSelector || "body",
      titleSelector: titleCss.cssSelector || "h1",
      coverSelector: coverCss.cssSelector || "img",
      detailUrlSelector: urlCss.cssSelector || "a",
      latestChapterSelector: lastCss.cssSelector || undefined,
      statusSelector: undefined, updateTimeSelector: undefined,
    },
    detail: {
      titleSelector: detTitleCss.cssSelector || "title",
      coverSelector: detCoverCss.cssSelector || undefined,
      authorSelector: detAuthCss.cssSelector || undefined,
      descriptionSelector: detDescCss.cssSelector || undefined,
      statusSelector: undefined,
      latestChapterSelector: undefined,
    },
    chapters: {
      listSelector: chListCss.cssSelector || "li",
      titleSelector: chNameCss.cssSelector || "a",
      urlSelector: chUrlCss.cssSelector || "a",
    },
    images: {
      listSelector: imgCss.cssSelector || "img",
      srcAttribute: imgCss.attr || "src",
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