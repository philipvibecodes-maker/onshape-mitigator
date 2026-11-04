# Onshape Mitigator privacy policy

Updated November 4, 2026.

Settings are stored locally in browser extension storage. The extension has no telemetry, analytics, backend, user account, or access to Onshape authentication credentials.

A user-triggered Copy context action reads document information for sharing. It copies document URL and IDs, names, tool state, selections where available, DOM-visible feature/variable rows, and available native feature/variable definitions to the clipboard. The snapshot is not retained in extension storage.

The separate **Save test state** action in Settings explicitly downloads a local JSON file for offline testing. It includes the document path and title, visible DOM text and layout, viewport dimensions, toolbar/tool state, selection, available feature/variable responses, and the name and notes you enter. Scripts, form values, and remote assets are excluded. The export does not read cookies, authentication headers, browser storage, or password-manager data. Captures may still contain private document content; review them before sharing or committing them to a repository. The extension does not upload captures or store a copy in extension storage. Downloaded files remain until you delete them.

By default, a successful copy also opens ChatGPT with context in its URL. Users may disable automatic opening or configure another HTTP/HTTPS website. A URL containing `{context}` sends the encoded snapshot to that destination, whose privacy policy applies. Without the placeholder, no snapshot is added to the URL. Clipboard contents are accessible according to the browser and operating system's normal rules.

Questions and reports: https://github.com/philipvibecodes-maker/onshape-mitigator
