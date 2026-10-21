import {
	ACCEPTED_ONSHAPE_TO_EXTENSION_EVENT_TYPE,
	FORWARDED_ONSHAPE_EVENTS,
} from "@/constants/onshapeEvents";
import { getStorageItem } from "@/storage/extensionStorage";
import type { OnshapeToolbarMode } from "@/types";
import type { ClassifiedOnshapeSelection } from "@/types/onshape/selection";

export type OnshapeDocumentIds = {
	documentId: string | null;
	referenceType: "w" | "v" | "m" | null;
	referenceId: string | null;
	elementId: string | null;
};

export type AiContextSnapshot = {
	capturedAt: string;
	url: string;
	ids: OnshapeDocumentIds;
	documentTitle: string;
	documentName: string | null;
	elementName: string | null;
	toolbarType: OnshapeToolbarMode | null;
	currentTool: string | null;
	featureDialogOpen: boolean;
	selections: ClassifiedOnshapeSelection[];
	features: string[];
	variables: string[];
};

function parseOnshapeUrl(href: string): OnshapeDocumentIds {
	const url = new URL(href);

	const pathMatch = url.pathname.match(
		/\/documents\/([^/]+)\/(w|v|m)\/([^/]+)\/e\/([^/?#]+)/,
	);
	if (pathMatch) {
		return {
			documentId: pathMatch[1],
			referenceType: pathMatch[2] as "w" | "v" | "m",
			referenceId: pathMatch[3],
			elementId: pathMatch[4],
		};
	}

	return {
		documentId:
			url.searchParams.get("documentId") ?? url.searchParams.get("did"),
		referenceType: url.searchParams.has("wvmId")
			? (url.searchParams.get("wvm") as "w" | "v" | "m" | null)
			: null,
		referenceId: url.searchParams.get("wvmId"),
		elementId: url.searchParams.get("elementId") ?? url.searchParams.get("eid"),
	};
}

function textOfFirst(selectors: string[]): string | null {
	for (const selector of selectors) {
		try {
			const el = document.querySelector<HTMLElement>(selector);
			const text = el?.textContent?.trim();
			if (text) return text;
		} catch {
			// ignore invalid selector and move on
		}
	}
	return null;
}

function getDocumentName(): string | null {
	const fromDom = textOfFirst([
		'[data-testid="document-title"]',
		".document-title",
		".navbar-document-name",
		"#document-title",
	]);
	if (fromDom) return fromDom;

	const title = document.title.replace(/\s*[-|–]\s*Onshape.*$/i, "").trim();
	return title || null;
}

function getActiveElementName(): string | null {
	return textOfFirst([
		".os-element-tab.active",
		'[class*="element-tab"][class*="active"]',
		".element-tabs .active",
		".os-tab-bar .active",
	]);
}

export function getCurrentSelections(
	timeoutMs = 1500,
): Promise<ClassifiedOnshapeSelection[]> {
	const requestId = crypto.randomUUID();

	return new Promise((resolve) => {
		const timeout = window.setTimeout(() => {
			window.removeEventListener("message", onMessage);
			resolve([]);
		}, timeoutMs);

		function onMessage(event: MessageEvent) {
			if (event.source !== window) return;
			const data = event.data;

			if (
				data?.type !== ACCEPTED_ONSHAPE_TO_EXTENSION_EVENT_TYPE ||
				data?.name !== FORWARDED_ONSHAPE_EVENTS.SELECTION_UPDATED ||
				data?.requestId !== requestId
			) {
				return;
			}

			window.clearTimeout(timeout);
			window.removeEventListener("message", onMessage);
			resolve(Array.isArray(data.data) ? data.data : []);
		}

		window.addEventListener("message", onMessage);

		window.postMessage(
			{ type: "GET_CURRENT_USER_SELECTIONS", requestId },
			window.location.origin,
		);
	});
}

function collectFeatureList(): string[] {
	const selectors = [
		"#feature-list .feature-list-item",
		".os-feature-list-item",
		'[class*="featurelist"] [class*="feature-item"]',
		'[ng-repeat*="feature"]',
	];

	for (const selector of selectors) {
		try {
			const rows = Array.from(document.querySelectorAll<HTMLElement>(selector));
			const names = rows
				.map((row) => row.textContent?.replace(/\s+/g, " ").trim() ?? "")
				.filter(Boolean);
			if (names.length) return names;
		} catch {
			// try next selector
		}
	}

	return [];
}

function collectVariables(): string[] {
	const selectors = [
		".variable-table tr",
		'[class*="variable-table"] [role="row"]',
		'[class*="variableTable"] tr',
	];

	for (const selector of selectors) {
		try {
			const rows = Array.from(document.querySelectorAll<HTMLElement>(selector));
			const values = rows
				.map((row) => row.textContent?.replace(/\s+/g, " ").trim() ?? "")
				.filter(Boolean);
			if (values.length) return values;
		} catch {
			// try next selector
		}
	}

	return [];
}

export async function collectAiContext(opts?: {
	toolbarType?: OnshapeToolbarMode | null;
	currentTool?: string | null;
}): Promise<AiContextSnapshot> {
	const selections = await getCurrentSelections().catch(() => []);

	return {
		capturedAt: new Date().toISOString(),
		url: window.location.href,
		ids: parseOnshapeUrl(window.location.href),
		documentTitle: document.title,
		documentName: getDocumentName(),
		elementName: getActiveElementName(),
		toolbarType: opts?.toolbarType ?? null,
		currentTool: opts?.currentTool ?? null,
		featureDialogOpen: Boolean(document.querySelector("#feature-dialog")),
		selections,
		features: collectFeatureList(),
		variables: collectVariables(),
	};
}

export function formatContextAsMarkdown(snapshot: AiContextSnapshot): string {
	const lines: string[] = [
		"# Onshape Context",
		"",
		`Captured: ${snapshot.capturedAt}`,
		"",
		"## Document",
		`- URL: ${snapshot.url}`,
		`- Title: ${snapshot.documentTitle}`,
	];

	if (snapshot.documentName) lines.push(`- Document: ${snapshot.documentName}`);
	if (snapshot.elementName)
		lines.push(`- Active element: ${snapshot.elementName}`);
	if (snapshot.ids.documentId)
		lines.push(`- Document ID: ${snapshot.ids.documentId}`);
	if (snapshot.ids.referenceId)
		lines.push(
			`- ${snapshot.ids.referenceType === "w" ? "Workspace" : snapshot.ids.referenceType === "v" ? "Version" : "Microversion"} ID: ${snapshot.ids.referenceId}`,
		);
	if (snapshot.ids.elementId)
		lines.push(`- Element ID: ${snapshot.ids.elementId}`);

	lines.push("", "## State");
	lines.push(`- Workspace mode: ${snapshot.toolbarType ?? "unknown"}`);
	lines.push(`- Active tool: ${snapshot.currentTool ?? "none"}`);
	lines.push(
		`- Feature dialog open: ${snapshot.featureDialogOpen ? "yes" : "no"}`,
	);

	lines.push("", "## Current selection");
	if (snapshot.selections.length) {
		for (const s of snapshot.selections) {
			const detail = [s.kind, "name" in s ? s.name : null, s.id]
				.filter(Boolean)
				.join(" — ");
			lines.push(`- ${detail}`);
		}
	} else {
		lines.push("- (none)");
	}

	if (snapshot.variables.length) {
		lines.push("", "## Variables");
		for (const v of snapshot.variables) lines.push(`- ${v}`);
	}

	if (snapshot.features.length) {
		lines.push("", "## Feature list");
		for (const f of snapshot.features) lines.push(`- ${f}`);
	}

	lines.push(
		"",
		"---",
		"The above is context about my current Onshape document. I will follow up with my specific question — please wait for it.",
	);

	return lines.join("\n");
}

export function showToast(message: string): void {
	const toast = document.createElement("div");
	toast.textContent = message;
	Object.assign(toast.style, {
		position: "fixed",
		bottom: "24px",
		left: "50%",
		transform: "translateX(-50%)",
		padding: "8px 16px",
		background: "rgba(18, 21, 29, 0.95)",
		color: "#f8fafc",
		borderRadius: "8px",
		border: "1px solid #2b3445",
		fontSize: "13px",
		zIndex: "999999",
		pointerEvents: "none",
		opacity: "0",
		transition: "opacity 150ms ease",
	});
	document.body.appendChild(toast);
	requestAnimationFrame(() => {
		toast.style.opacity = "1";
	});
	window.setTimeout(() => {
		toast.style.opacity = "0";
		window.setTimeout(() => toast.remove(), 200);
	}, 2200);
}

async function writeClipboard(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		try {
			const textarea = document.createElement("textarea");
			textarea.value = text;
			textarea.style.position = "fixed";
			textarea.style.opacity = "0";
			document.body.appendChild(textarea);
			textarea.select();
			const ok = document.execCommand("copy");
			textarea.remove();
			return ok;
		} catch {
			return false;
		}
	}
}

const CONTEXT_URL_MAX_LENGTH = 6000;

function buildChatbotUrl(template: string, context: string): string {
	if (!template.includes("{context}")) return template;

	const separatorIndex = template.indexOf("{context}");
	const prefix = template.slice(0, separatorIndex);
	const suffix = template.slice(separatorIndex + "{context}".length);
	const budget = Math.max(
		0,
		CONTEXT_URL_MAX_LENGTH - prefix.length - suffix.length,
	);

	let encoded = encodeURIComponent(context);
	while (encoded.length > budget && context.length > 0) {
		context = context.slice(0, Math.floor(context.length * 0.8));
		encoded = encodeURIComponent(context);
	}

	return `${prefix}${encoded}${suffix}`;
}

export async function copyAiContextToClipboard(opts?: {
	toolbarType?: OnshapeToolbarMode | null;
	currentTool?: string | null;
}): Promise<boolean> {
	const [snapshot, chatbotUrl, openAfterCopy] = await Promise.all([
		collectAiContext(opts),
		getStorageItem("aiChatbotUrl"),
		getStorageItem("aiOpenAfterCopy"),
	]);

	const markdown = formatContextAsMarkdown(snapshot);
	const ok = await writeClipboard(markdown);
	showToast(ok ? "Context copied for AI" : "Could not copy context");

	if (ok && openAfterCopy && chatbotUrl) {
		window.open(buildChatbotUrl(chatbotUrl, markdown), "_blank", "noopener");
	}

	return ok;
}
