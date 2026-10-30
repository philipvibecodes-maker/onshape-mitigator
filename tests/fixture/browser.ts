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
      addListener: (fn: (message: unknown) => void) => messageListeners.add(fn),
      removeListener: (fn: (message: unknown) => void) =>
        messageListeners.delete(fn),
    },
  },
  storage: {
    local: {
      get: async (keys: string | string[]) =>
        Object.fromEntries(
          (Array.isArray(keys) ? keys : [keys]).map((key) => [
            key,
            JSON.parse(localStorage.getItem("extension:" + key) ?? "null") ??
              undefined,
          ]),
        ),
      set: async (next: Record<string, unknown>) => {
        const changes: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(next)) {
          changes[key] = {
            oldValue:
              JSON.parse(localStorage.getItem("extension:" + key) ?? "null") ??
              undefined,
            newValue: value,
          };
          localStorage.setItem("extension:" + key, JSON.stringify(value));
        }
        for (const fn of storageListeners) fn(changes, "local");
      },
    },
    onChanged: {
      addListener: (
        fn: (changes: Record<string, unknown>, area: string) => void,
      ) => storageListeners.add(fn),
      removeListener: (
        fn: (changes: Record<string, unknown>, area: string) => void,
      ) => storageListeners.delete(fn),
    },
  },
};
