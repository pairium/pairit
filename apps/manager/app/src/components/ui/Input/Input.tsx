import { cn } from "@app/lib/utils";

import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { forwardRef } from "react";

const inputClasses =
	"flex h-11 w-full rounded-lg border border-slate-300 bg-white px-4 text-base text-slate-900 shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-50";

export const Input = forwardRef<
	ElementRef<"input">,
	ComponentPropsWithoutRef<"input">
>(({ className, type = "text", ...props }, ref) => {
	return (
		<input
			ref={ref}
			type={type}
			className={cn(inputClasses, className)}
			{...props}
		/>
	);
});

Input.displayName = "Input";
