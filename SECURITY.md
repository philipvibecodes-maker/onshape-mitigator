# Security policy

Onshape Mitigator is an independent Chrome/Edge extension for `https://*.onshape.com/*`.

Permissions are `storage` for local settings and `clipboardWrite` for explicitly requested document-context copies. Document information is shared externally only when a user requests context copying and has configured automatic chatbot opening with `{context}` in its URL. This is enabled by default for ChatGPT and can be disabled in Settings.

The page-context bridge exposes only typed state and selection reads. It validates source, origin, and message shape; the client correlates responses and applies timeouts. Page scripts share the page context, so the bridge is not an authentication boundary against the Onshape page itself. It never grants access to extension storage or privileged browser APIs.

No remotely hosted executable code, analytics, credential access, or arbitrary command/broadcast bridge endpoints are included. The variables shortcut clicks an existing Onshape UI button; collapse modifies only the active sketch dialog.

Report vulnerabilities privately through this repository's GitHub security advisory facility. See [security overview](docs/security-overview.md) and [privacy policy](privacy-policy.md).
