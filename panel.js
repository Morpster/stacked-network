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
});

filterElement.addEventListener("input", renderRequests);
clearButton.addEventListener("click", clearAll);

function clearAll() {
  requests.length = 0;
  selectedRequest = null;
  detailsElement.textContent = "Select a request to see its details.";
  renderRequests();
}

function renderRequests() {
  requestsElement.replaceChildren();

  const filter = filterElement.value.trim().toLowerCase();
  const visible = filter
    ? requests.filter(r => r.request.url.toLowerCase().includes(filter))
    : requests;

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
      `  ${base}`
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
      renderRequests();
      renderDetails(request);
    });

    requestsElement.append(button);
  }
}

// Splits a URL into everything but the query string, plus decoded params.
function splitUrl(url) {
  const queryStart = url.indexOf("?");
  if (queryStart === -1) return { base: url, params: [] };

  const hashStart = url.indexOf("#", queryStart);
  const query = url.slice(queryStart + 1, hashStart === -1 ? undefined : hashStart);
  const hash = hashStart === -1 ? "" : url.slice(hashStart);
  return {
    base: url.slice(0, queryStart) + hash,
    params: [...new URLSearchParams(query)],
  };
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

  const paramsDetails = document.createElement("details");
  paramsDetails.className = "query-params";
  paramsDetails.open = true;
  const summary = document.createElement("summary");
  summary.textContent = `Query parameters (${params.length})`;
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
  paramsDetails.append(summary, paramsPre);

  let showingRaw = false;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = "Show raw";
  toggle.addEventListener("click", () => {
    showingRaw = !showingRaw;
    if (showingRaw) showRaw();
    else showParsed();
    paramsDetails.hidden = showingRaw;
    toggle.textContent = showingRaw ? "Show parsed" : "Show raw";
  });

  detailsElement.append(toggle, pre, paramsDetails);
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

// Returns `{ value }` for JSON bodies, or null when the body isn't JSON.
function parseJsonBody(content, mimeType = "") {
  const text = content ?? "";
  const looksJson =
    /json/i.test(mimeType) || /^\s*[\[{]/.test(text);
  if (!looksJson) return null;

  try {
    return { value: JSON.parse(text) };
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
  if (typeof value === "number") return createSpan("json-number", String(value));
  if (typeof value === "boolean") return createSpan("json-boolean", String(value));

  const isArray = Array.isArray(value);
  const entries = isArray
    ? value.map(item => [null, item])
    : Object.entries(value);
  const [open, close] = isArray ? ["[", "]"] : ["{", "}"];
  const bracketClass = `bracket bracket-${depth % BRACKET_COLORS}`;

  const node = document.createElement("span");
  node.className = "json-node";

  if (entries.length === 0) {
    node.append(createSpan(bracketClass, open + close));
    return node;
  }

  const children = createSpan("json-children", "");
  const indent = INDENT.repeat(depth + 1);
  entries.forEach(([key, item], index) => {
    children.append(`\n${indent}`);
    if (key !== null) children.append(createSpan("json-key", JSON.stringify(key)), ": ");
    children.append(buildJsonNode(item, depth + 1));
    if (index < entries.length - 1) children.append(",");
  });
  children.append(`\n${INDENT.repeat(depth)}`);

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

  node.append(fold, createSpan(bracketClass, open), children, summary, createSpan(bracketClass, close));
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
      const opening = bracket === "{" || bracket === "[";
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

  let container = detailsElement;
  if (collapsible) {
    container = document.createElement("details");
    container.className = "body-section";
    container.open = true;
    const summary = document.createElement("summary");
    const heading = document.createElement("h3");
    heading.textContent = title;
    summary.append(heading);
    container.append(summary);
    detailsElement.append(container);
  } else {
    const heading = document.createElement("h3");
    heading.textContent = title;
    detailsElement.append(heading);
  }

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
    container.append(toggle);
  }

  container.append(pre);
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
