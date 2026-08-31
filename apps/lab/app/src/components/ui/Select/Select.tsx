import { cn } from "@app/lib/utils";
import { ChevronDown } from "lucide-react";

import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { forwardRef } from "react";

const selectClasses =
	"flex h-11 w-full appearance-none items-center rounded-lg border border-slate-300 bg-white px-4 pr-10 text-base text-slate-900 shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-50";

export const Select = forwardRef<
	ElementRef<"select">,
	ComponentPropsWithoutRef<"select">
>(({ className, ...props }, ref) => {
	return (
		<div className="relative">
			<select ref={ref} className={cn(selectClasses, className)} {...props} />
			<ChevronDown
				aria-hidden="true"
				className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-slate-500"
			/>
		</div>
	);
});

Select.displayName = "Select";
