import React from "react";
import browser from "webextension-polyfill";
import { createRoot } from "react-dom/client";
import cssText from "@/styles/extension.css?inline";
import onshapeThemeCss from "@/styles/onshape-theme.css?inline";
import { App } from "./App";
import { DisabledExtensionMenu } from "./components/DisabledExtensionMenu";
import { TooltipProvider } from "./components/ui/tooltip";
import { ExtensionSettingsProvider } from "./contexts/ExtensionSettingsContext";
import { OnshapeBridgeProvider } from "./contexts/OnshapeBridgeContext";
import { SettingsDialogProvider } from "./contexts/SettingsDialogContext";
import { applyTheme } from "./core/theme";
import { copyOnshapeIconSpriteToShadowRoot, delay } from "./core/utils";
import { PortalContainerProvider } from "./extensions/PortalContainerContext";
import { getStorageItem, watchStorageItem } from "./storage/extensionStorage";

const applySelectedTheme = async (run = 1, maxRun = 20) => {
	if (run > maxRun) return;
	const t = await getStorageItem("theme");
	applyTheme(t);
	await delay(100);
	const newRunCount = run + 1;
	void applySelectedTheme(newRunCount, maxRun);
};

function injectOnshapeBridge(): void {
	if (document.getElementById("os-onshape-page-bridge")) return;

	const script = document.createElement("script");
	script.id = "os-onshape-page-bridge";
	script.src = browser.runtime.getURL("onshape-page-bridge.js");

	document.documentElement.appendChild(script);
}

function injectGlobalStyle(id: string, css: string) {
	if (document.getElementById(id)) return;

	const style = document.createElement("style");
	style.id = id;
	style.textContent = css;
	document.documentElement.appendChild(style);
}

async function startExtension() {
	const enabled = await getStorageItem("extensionEnabled");
	// Reload all open Onshape tabs to fully remove page-level modifications.
	watchStorageItem("extensionEnabled", (next) => {
		if (next !== enabled) window.location.reload();
	});

	if (!enabled) {
		const container = document.createElement("div");
		container.id = "onshape-extension-host";
		document.documentElement.appendChild(container);
		const shadow = container.attachShadow({ mode: "open" });
		const root = document.createElement("div");
		shadow.appendChild(root);
		createRoot(root).render(<DisabledExtensionMenu />);
		return;
	}

	applySelectedTheme();
	injectOnshapeBridge();
	injectGlobalStyle("os-onshape-theme", onshapeThemeCss);

	document.documentElement.dataset.osTheme = "dark";
	document.body.dataset.osTheme = "dark";
	document.body.dataset.bsTheme = "dark";

	if (!document.getElementById("onshape-extension-host")) {
		const host = document.createElement("div");
		host.id = "onshape-extension-host";
		document.documentElement.appendChild(host);

		const shadow = host.attachShadow({ mode: "open" });
		setTimeout(() => {
			copyOnshapeIconSpriteToShadowRoot(shadow);
		}, 2000);

		const style = document.createElement("style");
		style.textContent = cssText;

		const root = document.createElement("div");
		root.id = "onshape-extension-root";
		root.className = "font-sans";

		const portalRoot = document.createElement("div");
		portalRoot.id = "onshape-extension-portal-root";
		portalRoot.className = "font-sans";

		shadow.appendChild(style);
		shadow.appendChild(root);
		shadow.appendChild(portalRoot);

		applySelectedTheme();

		createRoot(root).render(
			<React.StrictMode>
				<OnshapeBridgeProvider>
					<ExtensionSettingsProvider>
						<SettingsDialogProvider>
							<PortalContainerProvider container={portalRoot}>
								<TooltipProvider
									delayDuration={350}
									skipDelayDuration={0}
									disableHoverableContent
								>
									<App />
								</TooltipProvider>
							</PortalContainerProvider>
						</SettingsDialogProvider>
					</ExtensionSettingsProvider>
				</OnshapeBridgeProvider>
			</React.StrictMode>,
		);
	}
}

void startExtension();
