import * as React from "react";

import { Input } from "@/components/ui/input";

/**
 * Numeric input that refuses the `,` character outright.
 */
function NumberInput({
	onKeyDown,
	onPaste,
	type = "number",
	...props
}: React.ComponentProps<typeof Input>) {
	return (
		<Input
			type={type}
			onKeyDown={(e) => {
				if (e.key === ",") {
					e.preventDefault();
					return;
				}
				onKeyDown?.(e);
			}}
			onPaste={(e) => {
				const text = e.clipboardData?.getData("text") ?? "";
				if (text.includes(",")) {
					e.preventDefault();
					const cleaned = text.replace(/,/g, "");
					const target = e.currentTarget;
					const start = target.selectionStart ?? target.value.length;
					const end = target.selectionEnd ?? target.value.length;
					const next = target.value.slice(0, start) + cleaned + target.value.slice(end);
					const setter = Object.getOwnPropertyDescriptor(
						window.HTMLInputElement.prototype,
						"value",
					)?.set;
					setter?.call(target, next);
					target.dispatchEvent(new Event("input", { bubbles: true }));
					return;
				}
				onPaste?.(e);
			}}
			{...props}
		/>
	);
}

export { NumberInput };
