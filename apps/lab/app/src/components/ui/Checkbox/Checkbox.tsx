import { cn } from "@app/lib/utils";

import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { forwardRef } from "react";

const checkboxClasses =
	"m-0 size-5 shrink-0 rounded-md border border-slate-300 bg-white text-slate-900 accent-slate-900 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-50";

export const Checkbox = forwardRef<
	ElementRef<"input">,
	ComponentPropsWithoutRef<"input">
>(({ className, ...props }, ref) => {
	return (
		<input
			ref={ref}
			type="checkbox"
			className={cn(checkboxClasses, className)}
			{...props}
		/>
	);
});

Checkbox.displayName = "Checkbox";
