# Stacked Network
![Stacked Network logo](logo.svg)

Stacked Network is a Firefox DevTools extension that shows finished network requests in a single-column **Requests** panel. It is designed for inspecting requests and responses without switching between multiple views.

## Features

- Browse request methods, status codes, and URLs. Filter requests by URL, method, or status codes.
- Inspect request and response headers, with authorization headers tucked into an expandable section.
- View request bodies and load response bodies on demand, with a raw/pretty toggle for JSON.
- Switch between light and dark themes; the choice is saved locally.
- Also comes in 2 different colour themes (for light and dark themes) – or no colours if that is your preference.

The extension uses the DevTools network API to display requests from the inspected page. It does not send request data to a server: its content security policy blocks outbound connections from extension pages, and `no-network.js` blocks network APIs there as an additional guard.

## Try it in Firefox

You can install the signed `.xpi` from the [Releases page](https://github.com/Morpster/stacked-network/releases), or load the extension temporarily for development:

1. Open `about:debugging` in Firefox and select **This Firefox**.
2. Choose **Load Temporary Add-on…** and select `manifest.json` from this repository.
3. Open DevTools for a page and select the **Requests** panel. Reload the page to capture requests.

Temporary add-ons are removed when Firefox restarts.

## Ownership and license

Copyright (c) 2026 Martin Gravdal. Released under the [MIT License](LICENSE).
