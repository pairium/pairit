/**
 * WorkspaceView - Presentational workspace component
 * Supports freeform (markdown textarea) and structured (labeled fields) editing
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type FieldDefinition = {
	id: string;
	label: string;
	type?: "text" | "number" | "textarea";
};

export type WorkspaceViewProps = {
	mode: "freeform" | "structured";
	content: string;
	fields: Record<string, unknown>;
	fieldDefinitions?: FieldDefinition[];
	disabled?: boolean;
	onChange: (update: {
		content?: string;
		fields?: Record<string, unknown>;
	}) => void;
};

const DEBOUNCE_MS = 300;

export function WorkspaceView({
	mode,
	content,
	fields,
	fieldDefinitions = [],
	disabled = false,
	onChange,
}: WorkspaceViewProps) {
	if (mode === "structured") {
		return (
			<StructuredEditor
				fields={fields}
				fieldDefinitions={fieldDefinitions}
				disabled={disabled}
				onChange={onChange}
			/>
		);
	}

	return (
		<FreeformEditor content={content} disabled={disabled} onChange={onChange} />
	);
}

function FreeformEditor({
	content,
	disabled,
	onChange,
}: {
	content: string;
	disabled: boolean;
	onChange: WorkspaceViewProps["onChange"];
}) {
	const [localContent, setLocalContent] = useState(content);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const isLocalEdit = useRef(false);

	// Sync from parent when remote update arrives (not during local editing)
	useEffect(() => {
		if (!isLocalEdit.current) {
			setLocalContent(content);
		}
		isLocalEdit.current = false;
	}, [content]);

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			const value = e.target.value;
			isLocalEdit.current = true;
			setLocalContent(value);

			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
			debounceRef.current = setTimeout(() => {
				onChange({ content: value });
			}, DEBOUNCE_MS);
		},
		[onChange],
	);

	useEffect(() => {
		return () => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
		};
	}, []);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<textarea
				value={localContent}
				onChange={handleChange}
				disabled={disabled}
				className="min-h-0 flex-1 resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 font-mono text-sm leading-relaxed transition-colors focus:border-slate-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
				placeholder="Start writing..."
			/>
		</div>
	);
}

function StructuredEditor({
	fields,
	fieldDefinitions,
	disabled,
	onChange,
}: {
	fields: Record<string, unknown>;
	fieldDefinitions: FieldDefinition[];
	disabled: boolean;
	onChange: WorkspaceViewProps["onChange"];
}) {
	const [localFields, setLocalFields] = useState(fields);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const isLocalEdit = useRef(false);

	useEffect(() => {
		if (!isLocalEdit.current) {
			setLocalFields(fields);
		}
		isLocalEdit.current = false;
	}, [fields]);

	const handleFieldChange = useCallback(
		(fieldId: string, value: string | number) => {
			isLocalEdit.current = true;
			const updated = { ...localFields, [fieldId]: value };
			setLocalFields(updated);

			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
			debounceRef.current = setTimeout(() => {
				onChange({ fields: updated });
			}, DEBOUNCE_MS);
		},
		[localFields, onChange],
	);

	useEffect(() => {
		return () => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
		};
	}, []);

	if (fieldDefinitions.length === 0) {
		return (
			<div className="text-center text-sm text-slate-500">
				No fields defined for this workspace.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{fieldDefinitions.map((field) => {
				const value = localFields[field.id] ?? "";
				const fieldType = field.type ?? "text";

				return (
					<div key={field.id} className="space-y-1">
						<label
							htmlFor={`ws-field-${field.id}`}
							className="block text-sm font-medium text-slate-700"
						>
							{field.label}
						</label>
						{fieldType === "textarea" ? (
							<textarea
								id={`ws-field-${field.id}`}
								value={String(value)}
								onChange={(e) => handleFieldChange(field.id, e.target.value)}
								disabled={disabled}
								rows={4}
								className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm transition-colors focus:border-slate-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
							/>
						) : (
							<input
								id={`ws-field-${field.id}`}
								type={fieldType}
								value={
									fieldType === "number" ? (value as number) : String(value)
								}
								onChange={(e) =>
									handleFieldChange(
										field.id,
										fieldType === "number"
											? Number(e.target.value)
											: e.target.value,
									)
								}
								disabled={disabled}
								className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm transition-colors focus:border-slate-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}
