const api = globalThis.browser ?? chrome;

api.commands.onCommand.addListener((command) => {
	if (command === "reload-extension") api.runtime.reload();
});

api.action.onClicked.addListener(async (tab) => {
	if (tab.id == null) return;
	try {
		await api.tabs.sendMessage(tab.id, {
			type: "onshape-mitigator:toggle-menu",
		});
	} catch {
		// Pages outside Onshape (and tabs awaiting a reload after installation)
		// do not have the extension's content script.
	}
});
