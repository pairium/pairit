import { cn } from "@app/lib/utils";

import type { ComponentPropsWithoutRef, ElementRef, ReactNode } from "react";
import { createContext, forwardRef, useContext, useId } from "react";

interface RadioGroupContextValue {
	name: string;
	value: string | null;
	onValueChange: (value: string) => void;
	disabled?: boolean;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

export interface RadioGroupProps extends ComponentPropsWithoutRef<"div"> {
	value: string | null;
	onValueChange: (value: string) => void;
	name?: string;
	disabled?: boolean;
}

export const RadioGroup = forwardRef<ElementRef<"div">, RadioGroupProps>(
	(
		{ children, className, value, onValueChange, name, disabled, ...props },
		ref,
	) => {
		const generatedName = useId();
		const groupName = name ?? generatedName;

		return (
			<RadioGroupContext.Provider
				value={{ name: groupName, value, onValueChange, disabled }}
			>
				<div
					ref={ref}
					role="radiogroup"
					aria-disabled={disabled}
					className={cn("flex flex-col gap-2", className)}
					{...props}
				>
					{children}
				</div>
			</RadioGroupContext.Provider>
		);
	},
);

RadioGroup.displayName = "RadioGroup";

export interface RadioGroupItemProps extends ComponentPropsWithoutRef<"input"> {
	value: string;
	label: ReactNode;
	description?: ReactNode;
}

export const RadioGroupItem = forwardRef<
	ElementRef<"input">,
	RadioGroupItemProps
>(({ value, label, description, className, disabled, ...props }, ref) => {
	const context = useContext(RadioGroupContext);
	if (!context) {
		throw new Error("RadioGroupItem must be used within a RadioGroup");
	}

	const checked = context.value === value;
	const isDisabled = disabled ?? context.disabled;

	return (
		<label
			className={cn(
				"flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50",
				{
					"border-slate-900 bg-slate-900/5": checked,
					"cursor-not-allowed opacity-60": isDisabled,
				},
				className,
			)}
		>
			<span className="mt-1 inline-flex h-5 w-5 items-center justify-center">
				<input
					ref={ref}
					type="radio"
					className="h-4 w-4 rounded-full border border-slate-400 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
					name={context.name}
					value={value}
					checked={checked}
					disabled={isDisabled}
					onChange={() => context.onValueChange(value)}
					{...props}
				/>
			</span>
			<span className="flex flex-col gap-1 text-left">
				<span className="text-sm font-medium text-slate-900">{label}</span>
				{description ? (
					<span className="text-xs text-slate-500">{description}</span>
				) : null}
			</span>
		</label>
	);
});

RadioGroupItem.displayName = "RadioGroupItem";
