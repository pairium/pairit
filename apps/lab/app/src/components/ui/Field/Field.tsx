import { cn } from "@app/lib/utils";

import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { forwardRef } from "react";

export interface FieldProps extends ComponentPropsWithoutRef<"div"> {
	orientation?: "vertical" | "horizontal";
}

export const Field = forwardRef<ElementRef<"div">, FieldProps>(
	({ className, orientation = "vertical", ...props }, ref) => {
		return (
			<div
				ref={ref}
				data-orientation={orientation}
				className={cn(
					"flex gap-4 rounded-xl border border-transparent p-1 data-[invalid=true]:border-red-300 data-[invalid=true]:bg-red-50",
					orientation === "horizontal" ? "flex-row items-start" : "flex-col",
					className,
				)}
				{...props}
			/>
		);
	},
);

Field.displayName = "Field";

export const FieldContent = forwardRef<
	ElementRef<"div">,
	ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
	return (
		<div
			ref={ref}
			className={cn("flex flex-1 flex-col gap-3", className)}
			{...props}
		/>
	);
});

FieldContent.displayName = "FieldContent";

export const FieldGroup = forwardRef<
	ElementRef<"div">,
	ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
	return (
		<div
			ref={ref}
			className={cn("flex flex-col gap-6", className)}
			{...props}
		/>
	);
});

FieldGroup.displayName = "FieldGroup";

export const FieldLabel = forwardRef<
	ElementRef<"label">,
	ComponentPropsWithoutRef<"label">
>(({ className, htmlFor, children, ...props }, ref) => {
	return (
		<label
			ref={ref}
			htmlFor={htmlFor}
			className={cn("text-sm font-medium text-slate-900", className)}
			{...props}
		>
			{children}
		</label>
	);
});

FieldLabel.displayName = "FieldLabel";

export const FieldDescription = forwardRef<
	ElementRef<"p">,
	ComponentPropsWithoutRef<"p">
>(({ className, ...props }, ref) => {
	return (
		<p
			ref={ref}
			className={cn("text-sm text-slate-500", className)}
			{...props}
		/>
	);
});

FieldDescription.displayName = "FieldDescription";

interface FieldErrorProps extends ComponentPropsWithoutRef<"div"> {
	errors?: string[];
}

export const FieldError = ({
	errors,
	className,
	...props
}: FieldErrorProps) => {
	if (!errors?.length) return null;
	return (
		<div
			className={cn("text-sm font-medium text-red-600", className)}
			role="alert"
			{...props}
		>
			{errors.map((error) => (
				<div key={error}>{error}</div>
			))}
		</div>
	);
};

export const FieldSet = forwardRef<
	ElementRef<"fieldset">,
	ComponentPropsWithoutRef<"fieldset">
>(({ className, ...props }, ref) => {
	return (
		<fieldset
			ref={ref}
			className={cn("flex flex-col gap-4", className)}
			{...props}
		/>
	);
});

FieldSet.displayName = "FieldSet";

export const FieldLegend = forwardRef<
	ElementRef<"legend">,
	ComponentPropsWithoutRef<"legend">
>(({ className, ...props }, ref) => {
	return (
		<legend
			ref={ref}
			className={cn("text-sm font-semibold text-slate-900", className)}
			{...props}
		/>
	);
});

FieldLegend.displayName = "FieldLegend";
