#!/usr/bin/env node
// Network-safety check for the Stacked Network extension.
//
// Fails (exit code 1) if the extension could send anything out of the browser.
// It is deliberately strict: it uses allowlists, so anything it does not
// recognise is rejected, even if it happens to be harmless.
//
// Usage: node check-no-network.mjs <directory-to-check>
//
// In CI this script is run from the *previous* (already-trusted) commit
// against the *new* commit, so a change cannot weaken the rules that judge it.
// The script also refuses any change to itself or to the CI workflow.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const target = process.argv[2];
if (!target) {
  console.error("Usage: node check-no-network.mjs <directory-to-check>");
  process.exit(2);
}

const trustedRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const fail = (file, message) => errors.push(`${file}: ${message}`);
const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

// ---------------------------------------------------------------------------
// 1. Exact list of files allowed in the repository.
// ---------------------------------------------------------------------------

const EXTENSION_FILES = new Set([
  "manifest.json",
  "devtools.html",
  "devtools.js",
  "panel.html",
  "panel.js",
  "no-network.js",
  "icon.svg",
]);

const PROTECTED_FILES = [
  "scripts/check-no-network.mjs",
  ".github/workflows/no-network.yml",
];

const OTHER_ALLOWED = [
  /^\.gitignore$/,
  /^\.gitattributes$/,
  /^README\.md$/,
  /^LICENSE(\.md|\.txt)?$/,
];

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === ".git") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(relative(target, full).split(sep).join("/"));
  }
  return out;
}

const files = listFiles(target);

for (const file of files) {
  const allowed =
    EXTENSION_FILES.has(file) ||
    PROTECTED_FILES.includes(file) ||
    OTHER_ALLOWED.some(re => re.test(file));
  if (!allowed) fail(file, "file is not on the allowlist");
}

for (const file of EXTENSION_FILES) {
  if (!files.includes(file)) fail(file, "required file is missing");
}

// ---------------------------------------------------------------------------
// 2. The checker and the CI workflow must not change.
// ---------------------------------------------------------------------------

for (const file of PROTECTED_FILES) {
  let trusted;
  let candidate;
  try {
    trusted = read(join(trustedRoot, file));
    candidate = read(join(target, file));
  } catch {
    fail(file, "protected file is missing");
    continue;
  }
  if (trusted !== candidate) {
    fail(file, "protected file was changed (needs an admin bypass)");
  }
}

// ---------------------------------------------------------------------------
// 3. The runtime guard must be byte-for-byte the reviewed version.
// ---------------------------------------------------------------------------

const GUARD_SHA256 =
  "1f149f1ac8cc5cf6800785f85f12b59468707f827e0af8e0461131877ef0e3fe";

if (files.includes("no-network.js")) {
  const hash = createHash("sha256")
    .update(read(join(target, "no-network.js")))
    .digest("hex");
  if (hash !== GUARD_SHA256) {
    fail("no-network.js", "guard script was changed (needs an admin bypass)");
  }
}

// ---------------------------------------------------------------------------
// 4. manifest.json: only known keys, exact security policy, no permissions.
// ---------------------------------------------------------------------------

const EXPECTED_CSP =
  "default-src 'none'; script-src 'self'; object-src 'none'; " +
  "style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'none'; " +
  "form-action 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'";

if (files.includes("manifest.json")) {
  let manifest;
  try {
    manifest = JSON.parse(read(join(target, "manifest.json")));
  } catch {
    fail("manifest.json", "is not valid JSON");
  }

  if (manifest) {
    const allowedKeys = new Set([
      "manifest_version",
      "name",
      "version",
      "description",
      "devtools_page",
      "content_security_policy",
      "browser_specific_settings",
    ]);
    for (const key of Object.keys(manifest)) {
      if (!allowedKeys.has(key)) fail("manifest.json", `key "${key}" is not allowed`);
    }

    if (manifest.manifest_version !== 2) {
      fail("manifest.json", "manifest_version must be 2");
    }
    if (manifest.devtools_page !== "devtools.html") {
      fail("manifest.json", 'devtools_page must be "devtools.html"');
    }
    if (manifest.content_security_policy !== EXPECTED_CSP) {
      fail("manifest.json", "content_security_policy was changed");
    }

    const bss = manifest.browser_specific_settings ?? {};
    for (const key of Object.keys(bss)) {
      if (key !== "gecko") fail("manifest.json", `browser_specific_settings.${key} is not allowed`);
    }
    for (const key of Object.keys(bss.gecko ?? {})) {
      if (!["id", "strict_min_version", "strict_max_version", "data_collection_permissions"].includes(key)) {
        fail("manifest.json", `browser_specific_settings.gecko.${key} is not allowed`);
      }
    }

    const dataPermissions = bss.gecko?.data_collection_permissions;
    if (
      !dataPermissions ||
      typeof dataPermissions !== "object" ||
      Array.isArray(dataPermissions) ||
      Object.keys(dataPermissions).length !== 1 ||
      !Array.isArray(dataPermissions.required) ||
      dataPermissions.required.length !== 1 ||
      dataPermissions.required[0] !== "none"
    ) {
      fail("manifest.json", 'data_collection_permissions must be exactly {"required":["none"]}');
    }
  }
}

// ---------------------------------------------------------------------------
// 5. HTML pages: guard loads first, only local scripts, nothing that fetches.
// ---------------------------------------------------------------------------

const HTML_FORBIDDEN = [
  [/<\s*(img|iframe|frame|frameset|object|embed|link|base|meta\s+http-equiv|form|a|area|video|audio|source|track|picture|svg|image|portal|applet)\b/i, "element that can load or send data"],
  [/\s(src|href|action|formaction|srcset|poster|data|ping|background|manifest|xlink:href|codebase|archive)\s*=/i, "attribute that can load or send data"],
  [/url\s*\(/i, "CSS url()"],
  [/@import/i, "CSS @import"],
  [/\son[a-z]+\s*=/i, "inline event handler"],
  [/[a-z][a-z0-9+.-]*:\/\//i, "absolute URL"],
];

for (const page of ["devtools.html", "panel.html"]) {
  if (!files.includes(page)) continue;
  const html = read(join(target, page));

  const scripts = [...html.matchAll(/<\s*script\b([^>]*)>([\s\S]*?)<\s*\/\s*script\s*>/gi)];
  const openingTags = html.match(/<\s*script\b/gi) ?? [];
  if (openingTags.length !== scripts.length) fail(page, "malformed <script> tag");

  const sources = [];
  for (const [, attrs, body] of scripts) {
    const match = attrs.match(/^\s+src="([a-z-]+\.js)"\s*$/);
    if (!match) fail(page, `<script${attrs}> must be exactly <script src="name.js">`);
    else sources.push(match[1]);
    if (body.trim()) fail(page, "inline script content is not allowed");
  }

  if (sources[0] !== "no-network.js") {
    fail(page, "no-network.js must be the first script");
  }
  for (const src of sources) {
    if (!EXTENSION_FILES.has(src)) fail(page, `script "${src}" is not an allowed file`);
  }

  // Check everything except the (already validated) script tags.
  const rest = html.replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "");
  for (const [re, what] of HTML_FORBIDDEN) {
    if (re.test(rest)) fail(page, `contains ${what}: ${rest.match(re)[0].trim()}`);
  }
}

// ---------------------------------------------------------------------------
// 6. JavaScript: no network APIs, no ways to reach them indirectly.
// ---------------------------------------------------------------------------

const JS_FORBIDDEN = [
  [/\bfetch\b/, "fetch"],
  [/XMLHttpRequest/, "XMLHttpRequest"],
  [/WebSocket/, "WebSocket"],
  [/EventSource/, "EventSource"],
  [/WebTransport/, "WebTransport"],
  [/RTC[A-Za-z]*/, "WebRTC"],
  [/sendBeacon/, "sendBeacon"],
  [/Worker|worklet|importScripts/i, "workers"],
  [/\bnavigator\b/, "navigator"],
  [/\bimport\b/, "import"],
  [/\beval\b|\bFunction\b|constructor/, "dynamic code"],
  [/\b(setTimeout|setInterval)\s*\(\s*["'`]/, "string timer"],
  [/\b(window|self|globalThis|top|parent|opener|frames|Reflect|Proxy)\b/, "global object access"],
  [/\[\s*["'`]/, "computed property access with a string"],
  [/\b(location|open)\b/, "navigation"],
  [/\.(src|href|action|srcset|poster|ping|data)\b/, "property that can load data"],
  [/setAttribute\s*\(\s*["'`](?!aria-)/, "setAttribute (only aria-* allowed)"],
  [/innerHTML|outerHTML|insertAdjacentHTML|document\.write|createContextualFragment|DOMParser|srcdoc/, "HTML injection"],
  [/\.style\b|cssText|url\s*\(|@import|CSSStyleSheet|adoptedStyleSheets/, "styles that can load data"],
  [/\b(Image|Audio|Option)\s*\(/, "media constructors"],
  [/[a-z][a-z0-9+.-]*:\/\//i, "absolute URL"],
  [/\b(caches|indexedDB|cookieStore|serviceWorker|Notification|PushManager)\b/, "other outbound-capable APIs"],
];

const ALLOWED_ELEMENTS = new Set(["button", "h3", "pre", "details", "summary", "span"]);

// The only extension APIs the code may call.
const ALLOWED_BROWSER_CALLS = [
  /^browser\.devtools\.panels\.create\(/,
  /^browser\.devtools\.network\.onRequestFinished\.addListener\(/,
];

for (const file of ["devtools.js", "panel.js"]) {
  if (!files.includes(file)) continue;
  const js = read(join(target, file));

  for (const [re, what] of JS_FORBIDDEN) {
    const match = js.match(re);
    if (match) fail(file, `uses ${what}: "${match[0]}"`);
  }

  for (const match of js.matchAll(/\b(browser|chrome|messenger)\b/g)) {
    const rest = js.slice(match.index);
    if (!ALLOWED_BROWSER_CALLS.some(re => re.test(rest))) {
      fail(file, `extension API use is not allowed: "${rest.split("\n")[0]}"`);
    }
  }

  for (const match of js.matchAll(/createElement\s*\(([^)]*)\)/g)) {
    const tag = match[1].trim().match(/^["']([a-z0-9]+)["']$/)?.[1];
    if (!tag || !ALLOWED_ELEMENTS.has(tag)) {
      fail(file, `createElement(${match[1]}) is not allowed`);
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Icon: plain shapes only.
// ---------------------------------------------------------------------------

if (files.includes("icon.svg")) {
  const svg = read(join(target, "icon.svg"));
  const bad = svg.match(
    /<\s*(script|foreignObject|image|use|a|style|iframe|feImage)\b|\son[a-z]+\s*=|href|url\s*\(|@import|[a-z][a-z0-9+.-]*:\/\/(?!www\.w3\.org\/2000\/svg")/i
  );
  if (bad) fail("icon.svg", `contains "${bad[0]}"`);
}

// ---------------------------------------------------------------------------

if (errors.length) {
  console.error("Network-safety check FAILED:\n");
  for (const error of errors) console.error(`  - ${error}`);
  console.error(
    "\nThe extension must never send data out of the browser. " +
      "If this change is intentional and safe, an admin must review and bypass."
  );
  process.exit(1);
}

console.log("Network-safety check passed.");
