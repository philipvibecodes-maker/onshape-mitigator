const defaults: Record<string, unknown> = {
	hasSeenWelcomeDialog: true,
	floatingNumpadMode: "always",
	smartActionsEnabled: false,
};
const storageListeners = new Set<
	(changes: Record<string, unknown>, area: string) => void
>();
const messageListeners = new Set<(message: unknown) => void>();
export function clickExtensionIcon() {
	for (const listener of messageListeners)
		listener({ type: "onshape-mitigator:toggle-menu" });
}
export default {
	runtime: {
		getURL: () => "/tests/fixture/empty-bridge.js",
		onMessage: {
			addListener: (listener: (message: unknown) => void) =>
				messageListeners.add(listener),
			removeListener: (listener: (message: unknown) => void) =>
				messageListeners.delete(listener),
		},
	},
	storage: {
		local: {
			get: async (key: string) => ({
				[key]:
					JSON.parse(localStorage.getItem("extension:" + key) ?? "null") ??
					defaults[key],
			}),
			set: async (next: Record<string, unknown>) => {
				const changes: Record<string, unknown> = {};
				for (const [key, value] of Object.entries(next)) {
					changes[key] = {
						oldValue:
							JSON.parse(localStorage.getItem("extension:" + key) ?? "null") ??
							defaults[key],
						newValue: value,
					};
					localStorage.setItem("extension:" + key, JSON.stringify(value));
				}
				for (const listener of storageListeners) listener(changes, "local");
			},
		},
		onChanged: {
			addListener: (
				listener: (changes: Record<string, unknown>, area: string) => void,
			) => storageListeners.add(listener),
			removeListener: (
				listener: (changes: Record<string, unknown>, area: string) => void,
			) => storageListeners.delete(listener),
		},
	},
};
