import { useState } from "react";
import { useExtensionMenu } from "@/core/extensionMenu";
import { setStorageItem } from "@/storage/extensionStorage";

export function DisabledExtensionMenu() {
	const { open } = useExtensionMenu();
	const [error, setError] = useState(false);
	if (!open) return null;

	return (
		<div
			style={{
				position: "fixed",
				right: 16,
				top: 16,
				zIndex: 2147483647,
				padding: 20,
				borderRadius: 12,
				background: "#202020",
				color: "white",
				font: "14px system-ui",
				boxShadow: "0 4px 24px #0006",
			}}
		>
			<p style={{ margin: "0 0 12px" }}>Onshape Mitigator is disabled.</p>
			<button
				style={{ padding: "8px 12px", cursor: "pointer" }}
				onClick={() => {
					void setStorageItem("extensionEnabled", true).catch(() =>
						setError(true),
					);
				}}
			>
				Enable extension
			</button>
			<p style={{ margin: "12px 0 0" }}>Onshape tabs reload when enabled.</p>
			{error && (
				<p role="alert">Could not enable the extension. Please try again.</p>
			)}
		</div>
	);
}
