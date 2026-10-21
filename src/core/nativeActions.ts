const VARIABLE_TABLE_ICON_SELECTORS = [
	'use[href*="variable-table-button"]',
	'use[*|href*="variable-table-button"]',
	'use[xlink\\:href*="variable-table-button"]',
].join(", ");

function findVariableTableButton(): HTMLElement | null {
	const iconUse = document.querySelector<SVGUseElement>(
		VARIABLE_TABLE_ICON_SELECTORS,
	);

	if (!iconUse) return null;

	return iconUse.closest<HTMLElement>('button, [role="button"], a, [ng-click]');
}

export function toggleVariablesTable(): boolean {
	const button = findVariableTableButton();

	if (!button) {
		console.warn(
			"[OnshapeMitigator] Variable table button not found on this page",
		);
		return false;
	}

	button.click();
	return true;
}
