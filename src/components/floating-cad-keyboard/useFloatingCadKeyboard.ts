import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { suppressVirtualKeyboard } from "@/core/utils";
import { TEXT_ROWS } from "./keyboardConstants";
import type { CadKey, KeyboardMode, Position } from "./keyboardTypes";
import {
	getKeyboardPosition,
	isEditableInput,
	isTypingTarget,
} from "./keyboardUtils";

export function useFloatingCadKeyboard() {
	const keyboardRef = useRef<HTMLDivElement | null>(null);
	const activeInputRef = useRef<HTMLElement | null>(null);
	const focusFrameRef = useRef<number | null>(null);

	const [isVisible, setIsVisible] = useState(false);
	const [position, setPosition] = useState<Position>({ left: 0, top: 0 });
	const [mode, setMode] = useState<KeyboardMode>("numbers");
	const [isShift, setIsShift] = useState(false);

	const textKeys = useMemo(() => {
		return TEXT_ROWS.map((row) =>
			row.split("").map<CadKey>((char) => {
				const upper = char.toUpperCase();

				return {
					label: isShift ? upper : char,
					value: isShift ? upper : char,
					key: char,
					code: `Key${upper}`,
					keyCode: upper.charCodeAt(0),
					modifiers: isShift ? { shift: true } : undefined,
				};
			}),
		);
	}, [isShift]);

	const cancelFocusFrame = useCallback(() => {
		if (focusFrameRef.current !== null) {
			cancelAnimationFrame(focusFrameRef.current);
			focusFrameRef.current = null;
		}
	}, []);

	const hideKeyboard = useCallback(() => {
		cancelFocusFrame();
		setIsVisible(false);
		activeInputRef.current = null;
		setMode("numbers");
		setIsShift(false);
	}, [cancelFocusFrame]);

	const handleFocusIn = useCallback(
		(e: FocusEvent) => {
			const target = e.target;
			const keyboard = keyboardRef.current;

			if (!isTypingTarget(target)) return;
			if (keyboard?.contains(target)) return;

			cancelFocusFrame();
			activeInputRef.current = target;

			focusFrameRef.current = requestAnimationFrame(() => {
				focusFrameRef.current = null;
				if (
					!target.isConnected ||
					document.activeElement !== target ||
					activeInputRef.current !== target
				)
					return;
				setPosition(getKeyboardPosition(target, keyboardRef.current));
				setIsVisible(true);
			});
		},
		[cancelFocusFrame],
	);

	useEffect(() => {
		const cleanupKeyboardSuppression = suppressVirtualKeyboard();

		const handleFocusOut = (event: FocusEvent) => {
			if (event.target === activeInputRef.current) hideKeyboard();
		};
		window.addEventListener("focusin", handleFocusIn, true);
		window.addEventListener("focusout", handleFocusOut, true);

		return () => {
			cleanupKeyboardSuppression();

			window.removeEventListener("focusin", handleFocusIn, true);
			window.removeEventListener("focusout", handleFocusOut, true);
			cancelFocusFrame();
			activeInputRef.current = null;
		};
	}, [handleFocusIn, hideKeyboard, cancelFocusFrame]);

	const dispatchKeyboardKey = useCallback((keyConfig: CadKey) => {
		const el = activeInputRef.current;
		if (!el || !keyConfig.key) return;

		const eventInit = {
			key: keyConfig.key,
			code: keyConfig.code ?? "",
			keyCode: keyConfig.keyCode ?? 0,
			which: keyConfig.keyCode ?? 0,
			bubbles: false,
			cancelable: true,
			composed: false,
			shiftKey: keyConfig.modifiers?.shift ?? false,
			ctrlKey: keyConfig.modifiers?.ctrl ?? false,
			altKey: keyConfig.modifiers?.alt ?? false,
			metaKey: keyConfig.modifiers?.meta ?? false,
		};

		el.dispatchEvent(new KeyboardEvent("keydown", eventInit));
		el.dispatchEvent(new KeyboardEvent("keyup", eventInit));
	}, []);

	// execCommand is used deliberately: value assignment and synthetic input events
	// do not enter the browser's text undo history. Native input events from these
	// editing commands also notify Onshape without duplicate synthetic input events.
	const editText = useCallback(
		(command: "insertText" | "delete", text?: string) => {
			const el = activeInputRef.current;
			if (!el || (isEditableInput(el) && (el.readOnly || el.disabled))) return;
			const inputType =
				command === "insertText" ? "insertText" : "deleteContentBackward";
			if (
				!el.dispatchEvent(
					new InputEvent("beforeinput", {
						bubbles: true,
						composed: true,
						cancelable: true,
						inputType,
						data: text ?? null,
					}),
				)
			)
				return;
			if (document.execCommand(command, false, text)) {
				el.dispatchEvent(new Event("change", { bubbles: true }));
			}
		},
		[],
	);

	const insertText = useCallback(
		(text: string) => editText("insertText", text),
		[editText],
	);
	const deleteBackward = useCallback(() => editText("delete"), [editText]);
	const clearInput = useCallback(() => {
		const el = activeInputRef.current;
		if (!el) return;
		if (isEditableInput(el)) {
			el.select();
		} else if (el.isContentEditable) {
			const range = document.createRange();
			range.selectNodeContents(el);
			const selection = window.getSelection();
			selection?.removeAllRanges();
			selection?.addRange(range);
		}
		editText("delete");
	}, [editText]);

	const moveCaret = useCallback(
		(direction: "left" | "right", shiftKey = false) => {
			const el = activeInputRef.current;
			if (!el) return;

			if (isEditableInput(el) && !shiftKey) {
				const start = el.selectionStart ?? el.value.length;
				const end = el.selectionEnd ?? start;
				const nextPos =
					direction === "left"
						? start === end
							? Math.max(0, start - 1)
							: start
						: start === end
							? Math.min(el.value.length, end + 1)
							: end;

				el.setSelectionRange?.(nextPos, nextPos);
				return;
			}

			dispatchKeyboardKey({
				label: direction === "left" ? "←" : "→",
				key: direction === "left" ? "ArrowLeft" : "ArrowRight",
				code: direction === "left" ? "ArrowLeft" : "ArrowRight",
				keyCode: direction === "left" ? 37 : 39,
				modifiers: shiftKey ? { shift: true } : undefined,
			});
		},
		[dispatchKeyboardKey],
	);

	const sendCadKey = useCallback(
		(keyConfig: CadKey) => {
			const el = activeInputRef.current;
			if (!el) return;

			el.focus();

			if (keyConfig.key === "Backspace") {
				deleteBackward();
				return;
			}

			if (keyConfig.key === "Clear") {
				clearInput();
				return;
			}

			if (keyConfig.key === "ArrowLeft") {
				moveCaret("left", keyConfig.modifiers?.shift);
				return;
			}

			if (keyConfig.key === "ArrowRight") {
				moveCaret("right", keyConfig.modifiers?.shift);
				return;
			}

			if (
				keyConfig.key === "Enter" ||
				keyConfig.key === "Escape" ||
				keyConfig.key === "Tab"
			) {
				dispatchKeyboardKey(keyConfig);

				if (keyConfig.key === "Enter" || keyConfig.key === "Escape") {
					activeInputRef.current?.blur();
				}

				return;
			}

			const shouldDispatchOnly =
				keyConfig.modifiers?.ctrl ||
				keyConfig.modifiers?.alt ||
				keyConfig.modifiers?.meta;

			if (shouldDispatchOnly) {
				dispatchKeyboardKey(keyConfig);
				return;
			}

			if (keyConfig.value) {
				dispatchKeyboardKey(keyConfig);
				insertText(keyConfig.value);

				if (isShift && mode === "text") {
					setIsShift(false);
				}

				return;
			}

			dispatchKeyboardKey(keyConfig);
		},
		[
			clearInput,
			deleteBackward,
			dispatchKeyboardKey,
			insertText,
			isShift,
			mode,
			moveCaret,
		],
	);

	return {
		activeInputRef,
		hideKeyboard,
		isShift,
		isVisible,
		keyboardRef,
		mode,
		position,
		sendCadKey,
		setIsShift,
		setMode,
		textKeys,
	};
}
