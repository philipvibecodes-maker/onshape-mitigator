import { Bot, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useExtensionSettings } from "@/contexts/ExtensionSettingsContext";
import { cn } from "@/lib/utils";

export function AiAssistantConfig() {
	const { settings, setSetting } = useExtensionSettings();
	const [isExpanded, setIsExpanded] = useState(false);

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
					<Bot className="h-5 w-5" />
				</div>

				<div className="min-w-0 flex-1">
					<div className="text-sm font-medium text-card-foreground">
						AI Assistant
					</div>

					<div className="mt-1 text-xs leading-snug text-muted-foreground">
						Copy current document context for sharing with an AI chatbot.
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
						<div className="rounded-lg border border-border bg-background/45 p-3">
							<div className="font-medium text-card-foreground">
								Chatbot URL
							</div>
							<div className="mt-0.5 mb-2 text-xs leading-snug text-muted-foreground">
								Opened in a new tab after copying context. Use{" "}
								<code>{"{context}"}</code> as a placeholder to pre-fill the
								prompt (e.g. https://chatgpt.com/?q={"{context}"} or
								https://claude.ai/new?q={"{context}"}). Without it, paste
								the context with Ctrl+V.
							</div>
							<Input
								value={settings.aiChatbotUrl}
								placeholder="https://chatgpt.com/?q={context}"
								onChange={(e) => setSetting("aiChatbotUrl", e.target.value)}
							/>
						</div>

						<div className="rounded-lg border border-border bg-background/45 p-3">
							<div className="flex items-center justify-between gap-3">
								<div className="min-w-0">
									<div className="font-medium text-card-foreground">
										Open chatbot after copy
									</div>
								</div>

								<Switch
									checked={settings.aiOpenAfterCopy}
									onCheckedChange={(value) =>
										setSetting("aiOpenAfterCopy", value)
									}
								/>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
