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
    button.textContent =
      `${request.request.method}  ${request.response.status}  ${request.request.url}`;

    button.addEventListener("click", () => {
      selectedRequest = request;
      renderRequests();
      renderDetails(request);
    });

    requestsElement.append(button);
  }
}

function addSection(title, value) {
  const heading = document.createElement("h3");
  heading.textContent = title;

  const pre = document.createElement("pre");
  pre.textContent = value || "(empty)";

  detailsElement.append(heading, pre);
}

function formatHeaders(headers = []) {
  return headers.map(({ name, value }) => `${name}: ${value}`).join("\n");
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
  pre.textContent = formatHeaders(authHeaders);

  details.append(summary, pre);
  detailsElement.append(details);
}

function prettifyBody(content, mimeType = "") {
  const text = content ?? "";
  const looksJson =
    /json/i.test(mimeType) || /^\s*[\[{]/.test(text);
  if (!looksJson) return null;

  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

function addBodySection(title, content, mimeType) {
  const raw = content || "";
  const pretty = prettifyBody(raw, mimeType);

  const heading = document.createElement("h3");
  heading.textContent = title;

  const pre = document.createElement("pre");
  pre.textContent = (pretty ?? raw) || "(empty)";

  detailsElement.append(heading);

  if (pretty !== null) {
    let showingPretty = true;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = "Show raw";
    toggle.addEventListener("click", () => {
      showingPretty = !showingPretty;
      pre.textContent = showingPretty ? pretty : raw;
      toggle.textContent = showingPretty ? "Show raw" : "Show pretty";
    });
    detailsElement.append(toggle);
  }

  detailsElement.append(pre);
}

function renderDetails(request) {
  detailsElement.replaceChildren();

  addSection("Request", `${request.request.method} ${request.request.url}`);
  addSection(
    "Status",
    `${request.response.status} ${request.response.statusText || ""}`
  );
  addRequestHeadersSection(request.request.headers);
  addSection("Response headers", formatHeaders(request.response.headers));

  if (request.request.postData?.text) {
    addBodySection(
      "Request body",
      request.request.postData.text,
      request.request.postData.mimeType
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
