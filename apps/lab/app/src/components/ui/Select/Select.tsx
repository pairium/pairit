import { cn } from "@app/lib/utils";

import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { forwardRef } from "react";

const selectClasses =
	"flex h-11 w-full appearance-none rounded-lg border border-slate-300 bg-white px-4 text-base text-slate-900 shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-50";

export const Select = forwardRef<
	ElementRef<"select">,
	ComponentPropsWithoutRef<"select">
>(({ className, ...props }, ref) => {
	return (
		<select ref={ref} className={cn(selectClasses, className)} {...props} />
	);
});

Select.displayName = "Select";
