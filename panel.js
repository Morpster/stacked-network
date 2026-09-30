const requestsElement = document.querySelector("#requests");
const detailsElement = document.querySelector("#details");
const filterElement = document.querySelector("#filter");
const clearButton = document.querySelector("#clear");

const themeToggle = document.querySelector("#theme-toggle");
const THEME_KEY = "stacked-network-theme";

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const next = theme === "dark" ? "light" : "dark";
  themeToggle.textContent = theme === "dark" ? "Light theme" : "Dark theme";
  themeToggle.setAttribute("aria-label", `Switch to ${next} theme`);
}

applyTheme(localStorage.getItem(THEME_KEY) || "dark");

themeToggle.addEventListener("click", () => {
  const theme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
});

const paletteToggle = document.querySelector("#palette-toggle");
const PALETTE_KEY = "stacked-network-palette";

function applyPalette(palette) {
  document.documentElement.dataset.palette = palette;
  paletteToggle.setAttribute("aria-pressed", String(palette === "vivid"));
  paletteToggle.textContent = `Palette: ${palette}`;
}

applyPalette(localStorage.getItem(PALETTE_KEY) === "vivid" ? "vivid" : "classic");

paletteToggle.addEventListener("click", () => {
  const palette =
    document.documentElement.dataset.palette === "vivid" ? "classic" : "vivid";
  localStorage.setItem(PALETTE_KEY, palette);
  applyPalette(palette);
});

const bracketToggle = document.querySelector("#bracket-toggle");
const BRACKETS_KEY = "stacked-network-bracket-colors";

function applyBracketColors(enabled) {
  document.documentElement.dataset.brackets = enabled ? "on" : "off";
  bracketToggle.setAttribute("aria-pressed", String(enabled));
  bracketToggle.textContent = enabled ? "Colors: on" : "Colors: off";
}

applyBracketColors(localStorage.getItem(BRACKETS_KEY) !== "off");

bracketToggle.addEventListener("click", () => {
  const enabled = document.documentElement.dataset.brackets !== "on";
  localStorage.setItem(BRACKETS_KEY, enabled ? "on" : "off");
  applyBracketColors(enabled);
});

const requests = [];
let selectedRequest = null;

browser.devtools.network.onRequestFinished.addListener(request => {
  requests.push(request);
  renderRequests();
  methodFilter.refresh();
  statusFilter.refresh();
});

filterElement.addEventListener("input", renderRequests);
clearButton.addEventListener("click", clearAll);

// A compact multi-select dropdown. Nothing selected means "show all".
// Options come from the captured requests, so only real values appear.
function createMultiFilter(root, { label, noun, getValue, compare, renderValue }) {
  const trigger = root.querySelector(".multi-filter-button");
  const menu = root.querySelector(".multi-filter-menu");
  const selected = new Set();

  function renderTrigger() {
    const values = [...selected].sort(compare);
    trigger.replaceChildren();
    if (values.length === 0) {
      trigger.append(label);
    } else {
      trigger.append(renderValue(values[0]));
      if (values.length > 1) {
        const count = document.createElement("span");
        count.className = "multi-filter-count";
        count.textContent = `+${values.length - 1}`;
        trigger.append(" ", count);
      }
    }
    root.dataset.active = String(values.length > 0);
    trigger.setAttribute(
      "aria-label",
      values.length === 0 ? `${label}: all` : `${label}: ${values.join(", ")}`
    );
  }

  function renderMenu() {
    const values = [...new Set([...requests.map(getValue), ...selected])].sort(compare);
    menu.replaceChildren();

    if (values.length === 0) {
      const empty = document.createElement("span");
      empty.className = "multi-filter-empty";
      empty.textContent = `No ${noun} yet`;
      menu.append(empty);
      return;
    }

    for (const value of values) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "multi-filter-option";
      option.setAttribute("aria-pressed", String(selected.has(value)));
      const check = document.createElement("span");
      check.className = "multi-filter-check";
      option.append(check, renderValue(value));
      option.addEventListener("click", () => {
        if (selected.has(value)) selected.delete(value);
        else selected.add(value);
        option.setAttribute("aria-pressed", String(selected.has(value)));
        renderTrigger();
        renderRequests();
      });
      menu.append(option);
    }

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "multi-filter-reset";
    reset.textContent = "Show all";
    reset.disabled = selected.size === 0;
    reset.addEventListener("click", () => {
      selected.clear();
      renderTrigger();
      renderMenu();
      renderRequests();
    });
    menu.append(reset);
  }

  function setExpanded(expanded) {
    menu.hidden = !expanded;
    trigger.setAttribute("aria-expanded", String(expanded));
    if (expanded) renderMenu();
  }

  trigger.addEventListener("click", () => setExpanded(menu.hidden));
  document.addEventListener("click", event => {
    if (!root.contains(event.target)) setExpanded(false);
  });
  root.addEventListener("keydown", event => {
    if (event.key === "Escape" && !menu.hidden) {
      setExpanded(false);
      trigger.focus();
    }
  });

  renderTrigger();
  return {
    matches: value => selected.size === 0 || selected.has(value),
    // Keep a visible menu in sync as new requests arrive.
    refresh: () => { if (!menu.hidden) renderMenu(); },
  };
}

const methodFilter = createMultiFilter(document.querySelector("#method-filter"), {
  label: "Method",
  noun: "methods",
  getValue: request => request.request.method,
  compare: (a, b) => a.localeCompare(b),
  renderValue: createMethodSpan,
});

const statusFilter = createMultiFilter(document.querySelector("#status-filter"), {
  label: "Status",
  noun: "statuses",
  getValue: request => request.response.status,
  compare: (a, b) => a - b,
  renderValue: createStatusSpan,
});

// The list is capped at 40% of the viewport height and scrolls on its own;
// "Expand list" lifts the cap so the page scrolls instead.
const expandButton = document.querySelector("#expand-list");

function setListExpanded(expanded) {
  requestsElement.dataset.expanded = String(expanded);
  expandButton.setAttribute("aria-pressed", String(expanded));
  expandButton.textContent = expanded ? "Collapse list" : "Expand list";
  updateScrollHints();
}

// Shows the edge fades (see #requests-frame CSS) only when the list
// actually has hidden content in that direction.
const requestsFrame = document.querySelector("#requests-frame");

function updateScrollHints() {
  const { scrollTop, scrollHeight, clientHeight } = requestsElement;
  requestsFrame.dataset.moreAbove = String(scrollTop > 1);
  requestsFrame.dataset.moreBelow = String(scrollHeight - scrollTop - clientHeight > 1);
}

requestsElement.addEventListener("scroll", updateScrollHints, { passive: true });
new ResizeObserver(updateScrollHints).observe(requestsElement);

// Up/Down arrows move the selection to the previous/next request.
requestsElement.addEventListener("keydown", event => {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  const buttons = [...requestsElement.querySelectorAll(".request")];
  const index = buttons.indexOf(document.activeElement);
  if (index === -1) return;
  event.preventDefault();
  buttons[index + (event.key === "ArrowDown" ? 1 : -1)]?.click();
});

setListExpanded(false);
expandButton.addEventListener("click", () => {
  setListExpanded(requestsElement.dataset.expanded !== "true");
});

function clearAll() {
  requests.length = 0;
  selectedRequest = null;
  detailsElement.textContent = "Select a request to see its details.";
  renderRequests();
}

function renderRequests() {
  // Stay pinned to the newest request if the user was already at the
  // bottom; otherwise keep their scroll position while re-rendering.
  const { scrollTop, scrollHeight, clientHeight } = requestsElement;
  const wasAtBottom = scrollHeight - scrollTop - clientHeight < 8;
  renderRequestList();
  requestsElement.scrollTop = wasAtBottom ? requestsElement.scrollHeight : scrollTop;
  updateScrollHints();
}

function renderRequestList() {
  requestsElement.replaceChildren();

  const filter = filterElement.value.trim().toLowerCase();
  const visible = requests.filter(r =>
    (!filter || r.request.url.toLowerCase().includes(filter)) &&
    methodFilter.matches(r.request.method) &&
    statusFilter.matches(r.response.status)
  );

  if (visible.length === 0) {
    requestsElement.textContent = requests.length === 0
      ? "No finished requests yet. Reload the page to capture some."
      : "No requests match the filter.";
    return;
  }

  for (const request of visible) {
    const button = document.createElement("button");
    button.className = "request";
    button.setAttribute("aria-current", String(request === selectedRequest));
    const { base, params } = splitUrl(request.request.url);
    button.append(
      createMethodSpan(request.request.method),
      "  ",
      createStatusSpan(request.response.status),
      "  ",
      ...highlightMatches(base, filter)
    );
    if (params.length > 0) {
      const badge = document.createElement("span");
      badge.className = "param-badge";
      badge.textContent = `?${params.length}`;
      badge.title = `${params.length} query parameter${params.length === 1 ? "" : "s"}`;
      button.append(" ", badge);
    }

    button.addEventListener("click", () => {
      selectedRequest = request;
      setListExpanded(false);
      renderRequests();
      renderDetails(request);
      // The list is rebuilt on render, so refocus the new button to keep
      // arrow-key navigation going.
      const current = requestsElement.querySelector('.request[aria-current="true"]');
      current?.focus({ preventScroll: true });
      current?.scrollIntoView({ block: "nearest" });
      // scrollIntoView ignores the list's padding, so snap fully to the
      // ends for the first/last request; otherwise the scroll hints stay on.
      if (current && !current.previousElementSibling) requestsElement.scrollTop = 0;
      if (current && !current.nextElementSibling) requestsElement.scrollTop = requestsElement.scrollHeight;
    });

    requestsElement.append(button);
  }
}

// Splits `text` into plain strings and highlighted spans for every
// case-insensitive occurrence of `filter` (already lowercased).
function highlightMatches(text, filter) {
  if (!filter) return [text];
  const lower = text.toLowerCase();
  // Lowercasing can change length for some characters; skip highlighting
  // rather than risk marking the wrong span.
  if (lower.length !== text.length) return [text];

  const parts = [];
  let last = 0;
  for (let i = lower.indexOf(filter); i !== -1; i = lower.indexOf(filter, last)) {
    if (i > last) parts.push(text.slice(last, i));
    const mark = document.createElement("span");
    mark.className = "filter-match";
    mark.textContent = text.slice(i, i + filter.length);
    parts.push(mark);
    last = i + filter.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// Splits a URL into everything but the query string, plus decoded params.
// Only a "?" before the fragment starts a query; with no params, the URL is
// returned unchanged.
function splitUrl(url) {
  const hashStart = url.indexOf("#");
  const queryStart = url.indexOf("?");
  if (queryStart === -1 || (hashStart !== -1 && hashStart < queryStart)) {
    return { base: url, params: [] };
  }

  const queryEnd = hashStart === -1 ? url.length : hashStart;
  const params = [...new URLSearchParams(url.slice(queryStart + 1, queryEnd))];
  if (params.length === 0) return { base: url, params };
  return { base: url.slice(0, queryStart) + url.slice(queryEnd), params };
}

function addRequestSection(request) {
  const { method, url } = request.request;
  const { base, params } = splitUrl(url);

  const heading = document.createElement("h3");
  heading.textContent = "Request";
  const pre = document.createElement("pre");
  detailsElement.append(heading);

  const showParsed = () => pre.replaceChildren(createMethodSpan(method), ` ${base}`);
  const showRaw = () => pre.replaceChildren(createMethodSpan(method), ` ${url}`);
  showParsed();

  if (params.length === 0) {
    detailsElement.append(pre);
    return;
  }

  const paramsPre = document.createElement("pre");
  params.forEach(([name, value], index) => {
    const nameSpan = document.createElement("span");
    nameSpan.className = "param-name";
    nameSpan.textContent = name;
    const valueSpan = document.createElement("span");
    valueSpan.className = "param-value";
    valueSpan.textContent = value;
    if (index > 0) paramsPre.append("\n");
    paramsPre.append(nameSpan, " = ", valueSpan);
  });
  const paramsFold = createSectionFold(`Query parameters (${params.length})`, [paramsPre]);
  paramsFold.classList.add("query-params");

  let showingRaw = false;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = "Show raw";
  toggle.addEventListener("click", () => {
    showingRaw = !showingRaw;
    if (showingRaw) showRaw();
    else showParsed();
    paramsFold.hidden = showingRaw;
    paramsPre.hidden = showingRaw || paramsFold.getAttribute("aria-expanded") === "false";
    toggle.textContent = showingRaw ? "Show parsed" : "Show raw";
  });

  detailsElement.append(toggle, pre, paramsFold, paramsPre);
}

// A button that shows/hides `targets`. Used instead of <details> so sections
// can start expanded.
function createSectionFold(label, targets) {
  const fold = document.createElement("button");
  fold.type = "button";
  fold.className = "section-fold";
  fold.textContent = label;
  fold.setAttribute("aria-expanded", "true");
  fold.addEventListener("click", () => {
    const expand = fold.getAttribute("aria-expanded") === "false";
    fold.setAttribute("aria-expanded", String(expand));
    for (const target of targets) target.hidden = !expand;
  });
  return fold;
}

// Status 0 (blocked/aborted) and anything unexpected count as errors.
function statusClass(status) {
  if (status >= 100 && status < 200) return "status-info";
  if (status >= 200 && status < 300) return "status-success";
  if (status >= 300 && status < 400) return "status-redirect";
  if (status >= 400 && status < 500) return "status-client-error";
  return "status-server-error";
}

function createStatusSpan(status, text = String(status)) {
  const span = document.createElement("span");
  span.className = `status ${statusClass(status)}`;
  span.textContent = text;
  return span;
}

// `value` is either plain text or an array of nodes/strings.
function addSection(title, value) {
  const heading = document.createElement("h3");
  heading.textContent = title;

  const pre = document.createElement("pre");
  if (Array.isArray(value) && value.length > 0) pre.append(...value);
  else pre.textContent = (!Array.isArray(value) && value) || "(empty)";

  detailsElement.append(heading, pre);
}

function createMethodSpan(method) {
  const span = document.createElement("span");
  span.className = "http-method";
  span.textContent = method;
  return span;
}

// Returns header lines as nodes with separately colorable names and values.
function formatHeaders(headers = []) {
  const nodes = [];
  headers.forEach(({ name, value }, index) => {
    if (index > 0) nodes.push("\n");
    const nameSpan = document.createElement("span");
    nameSpan.className = "header-name";
    nameSpan.textContent = name;
    const valueSpan = document.createElement("span");
    valueSpan.className = "header-value";
    valueSpan.textContent = value;
    nodes.push(nameSpan, ": ", valueSpan);
  });
  return nodes;
}

const AUTH_HEADER = /^(proxy-)?authorization$/i;

function addRequestHeadersSection(headers = []) {
  const authHeaders = headers.filter(({ name }) => AUTH_HEADER.test(name));
  const otherHeaders = headers.filter(({ name }) => !AUTH_HEADER.test(name));

  addSection("Request headers", formatHeaders(otherHeaders));

  if (authHeaders.length === 0) return;

  const details = document.createElement("details");
  details.className = "auth-headers";

  const summary = document.createElement("summary");
  summary.textContent = `Authorization (${authHeaders.length})`;

  const pre = document.createElement("pre");
  pre.append(...formatHeaders(authHeaders));

  details.append(summary, pre);
  detailsElement.append(details);
}

// Numbers are kept as their original source text so the pretty view shows
// exactly what was sent: no Infinity for 1e400, no precision loss for big
// integer IDs. Falls back to JSON.stringify if source text isn't available.
const NUMBER_SOURCE = Symbol("number-source");

function keepNumberSource(key, value, context) {
  if (typeof value !== "number") return value;
  return { [NUMBER_SOURCE]: context?.source ?? JSON.stringify(value) };
}

// Returns `{ value }` for JSON bodies, or null when the body isn't JSON.
function parseJsonBody(content, mimeType = "") {
  const text = content ?? "";
  const looksJson =
    /json/i.test(mimeType) || /^\s*[\[{]/.test(text);
  if (!looksJson) return null;

  try {
    return { value: JSON.parse(text, keepNumberSource) };
  } catch {
    return null;
  }
}

const BRACKET_COLORS = 3;
const INDENT = "  ";

function createSpan(className, text) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

// Builds a pretty-printed, colorized JSON tree where every non-empty object
// and array can be folded. Fold markers are drawn with CSS so copied text
// stays clean JSON.
function buildJsonNode(value, depth) {
  if (value === null) return createSpan("json-null", "null");
  if (typeof value === "string") return createSpan("json-string", JSON.stringify(value));
  if (typeof value === "number") return createSpan("json-number", JSON.stringify(value));
  if (value[NUMBER_SOURCE] !== undefined) return createSpan("json-number", value[NUMBER_SOURCE]);
  if (typeof value === "boolean") return createSpan("json-boolean", String(value));

  const isArray = Array.isArray(value);
  const entries = isArray
    ? value.map(item => [null, item])
    : Object.entries(value);
  const [openBracket, closeBracket] = isArray ? "[]" : "{}";
  const bracketClass = `bracket bracket-${depth % BRACKET_COLORS}`;

  const node = document.createElement("span");
  node.className = "json-node";

  if (entries.length === 0) {
    node.append(createSpan(bracketClass, openBracket + closeBracket));
    return node;
  }

  // Each entry is its own block with a hanging indent (see .json-entry CSS),
  // so wrapped long values line up with where the entry's text starts.
  const children = createSpan("json-children", "");
  entries.forEach(([key, item], index) => {
    const entry = createSpan("json-entry", INDENT);
    if (key !== null) entry.append(createSpan("json-key", JSON.stringify(key)), ": ");
    entry.append(buildJsonNode(item, depth + 1));
    if (index < entries.length - 1) entry.append(",");
    children.append(entry);
  });

  const count = entries.length;
  const noun = isArray ? (count === 1 ? "item" : "items") : (count === 1 ? "key" : "keys");
  const summary = createSpan("json-summary", `…${count} ${noun}`);
  summary.hidden = true;

  const fold = document.createElement("button");
  fold.type = "button";
  fold.className = "json-fold";
  fold.setAttribute("aria-expanded", "true");
  fold.setAttribute("aria-label", `Collapse ${isArray ? "array" : "object"}`);
  fold.addEventListener("click", () => {
    const collapse = !children.hidden;
    children.hidden = collapse;
    summary.hidden = !collapse;
    fold.setAttribute("aria-expanded", String(!collapse));
    fold.setAttribute(
      "aria-label",
      `${collapse ? "Expand" : "Collapse"} ${isArray ? "array" : "object"}`
    );
  });

  node.append(fold, createSpan(bracketClass, openBracket), children, summary, createSpan(bracketClass, closeBracket));
  return node;
}

// Matches one JSON token at a time: string, number, literal, or bracket.
const JSON_TOKEN =
  /("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\b(null)\b|([{}[\]])/g;

// Renders JSON text into `pre`, wrapping keys, values, and depth-tagged
// brackets in spans. Colors come from CSS and only apply when colors are
// enabled, so toggling needs no re-render.
function renderColorized(pre, text) {
  pre.replaceChildren();
  let depth = 0;
  let last = 0;

  const addSpan = (className, value) => {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = value;
    pre.append(span);
  };

  for (const match of text.matchAll(JSON_TOKEN)) {
    const [token, string, number, boolean, nullValue, bracket] = match;
    if (match.index > last) pre.append(text.slice(last, match.index));
    last = match.index + token.length;

    if (string !== undefined) {
      const isKey = /^\s*:/.test(text.slice(last));
      addSpan(isKey ? "json-key" : "json-string", token);
    } else if (number !== undefined) {
      addSpan("json-number", token);
    } else if (boolean !== undefined) {
      addSpan("json-boolean", token);
    } else if (nullValue !== undefined) {
      addSpan("json-null", token);
    } else if (bracket !== undefined) {
      const opening = "[{".includes(bracket);
      if (!opening) depth = Math.max(0, depth - 1);
      addSpan(`bracket bracket-${depth % BRACKET_COLORS}`, bracket);
      if (opening) depth++;
    }
  }
  if (text.length > last) pre.append(text.slice(last));
}

function addBodySection(title, content, mimeType, { collapsible = false } = {}) {
  const raw = content || "";
  const json = parseJsonBody(raw, mimeType);

  const pre = document.createElement("pre");
  const show = prettyView => {
    if (json === null) pre.textContent = raw || "(empty)";
    else if (prettyView) pre.replaceChildren(buildJsonNode(json.value, 0));
    else renderColorized(pre, raw);
  };
  show(true);

  const heading = document.createElement("h3");
  detailsElement.append(heading);

  const parts = [pre];
  if (json !== null) {
    let showingPretty = true;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = "Show raw";
    toggle.addEventListener("click", () => {
      showingPretty = !showingPretty;
      show(showingPretty);
      toggle.textContent = showingPretty ? "Show raw" : "Show pretty";
    });
    parts.unshift(toggle);
  }

  if (collapsible) {
    heading.append(createSectionFold(title, parts));
  } else {
    heading.textContent = title;
  }

  detailsElement.append(...parts);
}

function renderDetails(request) {
  detailsElement.replaceChildren();

  addRequestSection(request);
  const statusHeading = document.createElement("h3");
  statusHeading.textContent = "Status";
  const statusPre = document.createElement("pre");
  const { status, statusText } = request.response;
  statusPre.append(createStatusSpan(status, `${status} ${statusText || ""}`.trim()));
  detailsElement.append(statusHeading, statusPre);
  addRequestHeadersSection(request.request.headers);
  addSection("Response headers", formatHeaders(request.response.headers));

  if (request.request.postData?.text) {
    addBodySection(
      "Request body",
      request.request.postData.text,
      request.request.postData.mimeType,
      { collapsible: true }
    );
  }

  const bodyButton = document.createElement("button");
  bodyButton.textContent = "Load response body";
  bodyButton.addEventListener("click", async () => {
    bodyButton.disabled = true;
    bodyButton.textContent = "Loading…";

    try {
      const [content, mimeType] = await request.getContent();
      if (selectedRequest !== request) return;
      addBodySection(
        `Response body (${mimeType || "unknown type"})`,
        content,
        mimeType
      );
      bodyButton.remove();
    } catch (error) {
      bodyButton.disabled = false;
      bodyButton.textContent = "Could not load body; try again";
      console.error(error);
    }
  });

  detailsElement.append(bodyButton);
}
