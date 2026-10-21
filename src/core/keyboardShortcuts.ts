export type ParsedBinding = {
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
	meta: boolean;
	key: string;
};

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "CapsLock"]);

const KEY_ALIASES: Record<string, string> = {
	" ": "Space",
	Spacebar: "Space",
	Space: "Space",
	Escape: "Escape",
	Esc: "Escape",
};

export function normalizeKeyName(key: string): string {
	const aliased = KEY_ALIASES[key] ?? key;
	if (aliased.length === 1) return aliased.toUpperCase();
	return aliased;
}

export function eventToBinding(event: KeyboardEvent): string | null {
	if (MODIFIER_KEYS.has(event.key)) return null;

	const parts: string[] = [];
	if (event.ctrlKey) parts.push("Ctrl");
	if (event.altKey) parts.push("Alt");
	if (event.shiftKey) parts.push("Shift");
	if (event.metaKey) parts.push("Meta");
	parts.push(normalizeKeyName(event.key));

	return parts.join("+");
}

export function parseBinding(binding: string): ParsedBinding | null {
	if (!binding) return null;

	const parts = binding.split("+").map((p) => p.trim());
	const key = parts.pop();

	if (!key) return null;

	return {
		ctrl: parts.includes("Ctrl"),
		alt: parts.includes("Alt"),
		shift: parts.includes("Shift"),
		meta: parts.includes("Meta"),
		key: normalizeKeyName(key),
	};
}

export function matchesBinding(event: KeyboardEvent, binding: string): boolean {
	const parsed = parseBinding(binding);
	if (!parsed) return false;

	return (
		event.ctrlKey === parsed.ctrl &&
		event.altKey === parsed.alt &&
		event.shiftKey === parsed.shift &&
		event.metaKey === parsed.meta &&
		normalizeKeyName(event.key) === parsed.key
	);
}
