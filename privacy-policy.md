# Onshape Mitigator privacy policy

Updated November 9, 2026.

Settings are stored locally in browser extension storage. The extension has no telemetry, analytics, backend, user account, or access to Onshape authentication credentials.

Only a user-triggered copy action reads document information for sharing. **Copy context for AI** reads feature and variable definitions and runs a fixed, read-only FeatureScript evaluator to describe rollback-scoped faces, edges, bodies, and vertices. **Copy detailed info** copies compacted native feature and variable definitions without topology evaluation. Both may include document URL and IDs, names, tool state, and selections where available. The snapshot is not retained in extension storage.

Topology requests use the current Onshape page session for same-origin authentication. Authentication cookies and XSRF values are not copied, returned to the extension UI, stored, logged, or shared with a chatbot.

By default, a successful copy also opens ChatGPT with context in its URL. Users may disable automatic opening or configure another HTTP/HTTPS website. A URL containing `{context}` sends the encoded snapshot to that destination, whose privacy policy applies. Without the placeholder, no snapshot is added to the URL. Clipboard contents are accessible according to the browser and operating system's normal rules.

Questions and reports: https://github.com/philipvibecodes-maker/onshape-mitigator
