const values: Record<string, unknown> = {
	hasSeenWelcomeDialog: true,
	floatingNumpadMode: "always",
	smartActionsEnabled: false,
};
export default {
	storage: {
		local: {
			get: async (key: string) => ({ [key]: values[key] }),
			set: async (next: Record<string, unknown>) => Object.assign(values, next),
		},
		onChanged: { addListener() {}, removeListener() {} },
	},
};
