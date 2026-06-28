var fs = require('fs');
var src = fs.readFileSync('src/sources/legado-importer.ts', 'utf-8');

// Replace the stub function
src = src.replace(
  "function buildJsStub(raw, name) {",
  "function buildJsScript(raw, name) {"
);

src = src.replace(
  "if (hasJs) {",
  "if (hasJs) {"
);

// Replace the jsRules script assignment
src = src.replace(
  /source\.jsRules = \{ engine: "quickjs" as const, script: "function search\(args\)\{return\[\];\}function getComicDetail\(args\)\{return\{comicId:args\.comicId,title:'',cover:''\};}function getChapters\(args\)\{return\[\];\}function getChapterImages\(args\)\{return\{chapterId:args\.chapterId,images:\[\]\};}", timeoutMs: 8000, memoryLimitMb: 16 \};/,
  'source.jsRules = { engine: "quickjs" as const, script: buildJsScript(raw, name), timeoutMs: 8000, memoryLimitMb: 16 };'
);

// Replace the stub function body
var oldStub = src.indexOf("function buildJsStub");
var oldEnd = src.indexOf("export async function fetchAndImport");
if (oldStub > 0 && oldEnd > oldStub) {
  var newFunc = [
    'function buildJsScript(raw, name) {',
    '  var host = raw.bookSourceUrl || "";',
    '  var searchUrl = (raw.searchUrl || "").replace(/\\/g, "\\\\\\\\");',
    '  var h = host.replace(/\\/g, "\\\\\\\\");',
    '  var su = searchUrl.replace(/\\/g, "\\\\\\\\");',
    '  return [',
    '    "var HOST=\\\"" + h + "\\\";",',
    '    "var SEARCH_URL=\\\"" + su + "\\\";",',
    '    "function search(a){var q=encodeURIComponent(a.query);var u=SEARCH_URL.replace(/{{key}}/g,q);var r=[];try{var h=fetch(u).text();var re=/<li[^>]*class=[\\\\\\\"\\\']update_con[\\\\\\\"\\\'][^>]*>[\\s\\S]*?<\\/li>/gi;var m;while((m=re.exec(h))!==null){var t=(m[0].match(/class=[\\\\\\\"\\\']title[\\\\\\\"\\'][^>]*>([\\s\\S]*?)<\\//)||[])[1]||\\\"\\\";t=t.replace(/<[^>]*>/g,\\\"\\\").trim();var l=(m[0].match(/href=[\\\\\\\"\\\']([^\\\\\\\"\\\']*)[\\\\\\\"\\\']/)||[])[1]||\\\"\\\";var c=(m[0].match(/src=[\\\\\\\"\\\']([^\\\\\\\"\\\']*)[\\\\\\\"\\\']/)||[])[1]||\\\"\\\";if(t)r.push({title:t,comicId:l,cover:c});}}catch(e){}return r;}",',
    '    "function getComicDetail(a){return{comicId:a.comicId,title:\\\"\\\",cover:\\\"\\\"};}",',
    '    "function getChapters(a){return[];}",',
    '    "function getChapterImages(a){return{chapterId:a.chapterId,images:[]};}",',
    '  ].join("\n");',
    '}',
  ].join('\n');
  
  src = src.slice(0, oldStub) + newFunc + '\n' + src.slice(oldEnd);
}

fs.writeFileSync('src/sources/legado-importer.ts', src);
console.log('Fixed importer');
