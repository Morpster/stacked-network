// Second layer of protection: the manifest's content security policy already
// blocks network access. This script also replaces every network API in this
// page with one that throws, so any attempt fails loudly instead of silently.
// It must be the first script loaded on each extension page.
"use strict";

(() => {
  function fail(api) {
    const message = `Stacked Network: blocked network access via ${api}`;
    console.error(message);
    throw new Error(message);
  }

  function block(target, name) {
    if (!target || !(name in target)) return;
    Object.defineProperty(target, name, {
      configurable: false,
      writable: false,
      value: function blocked() {
        fail(name);
      },
    });
  }

  for (const name of [
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "EventSource",
    "WebTransport",
    "RTCPeerConnection",
    "Worker",
    "SharedWorker",
  ]) {
    block(window, name);
  }

  block(Navigator.prototype, "sendBeacon");

  window.addEventListener("securitypolicyviolation", event => {
    fail(`${event.violatedDirective} (${event.blockedURI})`);
  });
})();
