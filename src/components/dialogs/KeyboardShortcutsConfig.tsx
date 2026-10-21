import { ChevronDown, Keyboard, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	SHORTCUT_ACTIONS,
	type ShortcutActionId,
} from "@/constants/shortcutActions";
import { useExtensionSettings } from "@/contexts/ExtensionSettingsContext";
import { eventToBinding } from "@/core/keyboardShortcuts";
import { cn } from "@/lib/utils";
import { DEFAULT_STORAGE_VALUES } from "@/storage/extensionStorage";

type BindingCaptureProps = {
	binding: string;
	onCapture: (binding: string) => void;
};

function BindingCapture({ binding, onCapture }: BindingCaptureProps) {
	const [recording, setRecording] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!recording) return;

		function onKeyDown(event: KeyboardEvent) {
			event.preventDefault();
			event.stopPropagation();

			if (event.key === "Escape") {
				setRecording(false);
				buttonRef.current?.blur();
				return;
			}

			if (event.key === "Backspace" || event.key === "Delete") {
				onCapture("");
				setRecording(false);
				buttonRef.current?.blur();
				return;
			}

			const binding = eventToBinding(event);
			if (!binding) return;

			onCapture(binding);
			setRecording(false);
			buttonRef.current?.blur();
		}

		function onBlur() {
			setRecording(false);
		}

		window.addEventListener("keydown", onKeyDown, true);
		window.addEventListener("blur", onBlur);

		return () => {
			window.removeEventListener("keydown", onKeyDown, true);
			window.removeEventListener("blur", onBlur);
		};
	}, [recording, onCapture]);

	return (
		<Button
			ref={buttonRef}
			type="button"
			variant="ghost"
			className={cn(
				"shrink-0 cursor-pointer rounded-md border px-2 font-mono text-[11px]",
				recording
					? "border-primary/60 bg-primary/15 text-primary"
					: "border-border bg-background/50 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
			)}
			onClick={(e) => {
				e.stopPropagation();
				setRecording(true);
			}}
		>
			{recording ? "Press keys…" : binding || "Not set"}
		</Button>
	);
}

export function KeyboardShortcutsConfig() {
	const { settings, updateSetting } = useExtensionSettings();
	const [isExpanded, setIsExpanded] = useState(false);

	const setBinding = async (id: ShortcutActionId, binding: string) => {
		await updateSetting("keyboardShortcuts", (bindings) => ({
			...bindings,
			[id]: binding,
		}));
	};

	const resetAll = async () => {
		await updateSetting("keyboardShortcuts", () => ({
			...DEFAULT_STORAGE_VALUES.keyboardShortcuts,
		}));
	};

	return (
		<div className="rounded-xl border border-border bg-muted/35">
			<button
				type="button"
				className="
					flex w-full cursor-pointer items-center gap-3 p-3 text-left
					transition-colors hover:bg-accent
				"
				onClick={(event) => {
					event.stopPropagation();
					setIsExpanded((current) => !current);
				}}
			>
				<div
					className="
						flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
						border border-border bg-background/60 text-primary
					"
				>
					<Keyboard className="h-5 w-5" />
				</div>

				<div className="min-w-0 flex-1">
					<div className="text-sm font-medium text-card-foreground">
						Keyboard Shortcuts
					</div>

					<div className="mt-1 text-xs leading-snug text-muted-foreground">
						Remap extension shortcuts. Click a binding, then press the new keys.
						Backspace clears, Escape cancels.
					</div>
				</div>

				<Button
					size="icon"
					variant="ghost"
					type="button"
					tabIndex={-1}
					className="shrink-0 cursor-pointer text-muted-foreground hover:bg-background/60 hover:text-foreground"
				>
					<ChevronDown
						className={cn(
							"h-5 w-5 shrink-0 transition-transform",
							isExpanded && "rotate-180",
						)}
					/>
				</Button>
			</button>

			{isExpanded && (
				<div className="border-t border-border p-3 pt-2">
					<div className="flex flex-col gap-3">
						{SHORTCUT_ACTIONS.map((action) => {
							const binding = settings.keyboardShortcuts[action.id] ?? "";

							return (
								<div
									key={action.id}
									className="rounded-lg border border-border bg-background/45 p-3"
								>
									<div className="flex items-center justify-between gap-3">
										<div className="min-w-0">
											<div className="font-medium text-card-foreground">
												{action.label}
											</div>
											<div className="mt-0.5 text-xs leading-snug text-muted-foreground">
												{action.description}
											</div>
										</div>

										<div className="flex items-center gap-2">
											<BindingCapture
												binding={binding}
												onCapture={(next) => setBinding(action.id, next)}
											/>

											<Button
												type="button"
												variant="ghost"
												size="icon"
												title="Clear binding"
												className="
													h-8 w-8 shrink-0 cursor-pointer rounded-md border border-border
													bg-background/50 text-muted-foreground
													hover:bg-accent hover:text-accent-foreground
												"
												onClick={() => setBinding(action.id, "")}
											>
												<X className="h-3 w-3" />
											</Button>
										</div>
									</div>
								</div>
							);
						})}

						<div className="flex justify-end">
							<Button
								type="button"
								variant="ghost"
								className="
									cursor-pointer rounded-md border border-border
									bg-background/50 px-2 text-[11px] text-muted-foreground
									hover:bg-accent hover:text-accent-foreground
								"
								onClick={resetAll}
							>
								<RotateCcw className="mr-1 h-3 w-3" />
								Reset all shortcuts
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
