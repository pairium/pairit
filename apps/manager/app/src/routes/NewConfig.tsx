import { ApiError, api } from "@app/lib/api";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { YamlEditor } from "@components/YamlEditor";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

const STARTER_YAML = `schema_version: "0.1.0"
initialPageId: intro
pages:
  - id: intro
    components:
      - type: text
        props:
          content: "Welcome to the experiment."
      - type: button
        props:
          label: Continue
          to: done
  - id: done
    components:
      - type: text
        props:
          content: "Thanks for participating!"
`;

export function NewConfig() {
	const navigate = useNavigate();
	const [configId, setConfigId] = useState("");
	const [yamlText, setYamlText] = useState(STARTER_YAML);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSave = async () => {
		setSaving(true);
		setError(null);
		try {
			const created = await api.uploadConfigYaml({
				configId: configId.trim() || undefined,
				yaml: yamlText,
			});
			navigate({
				to: "/configs/$configId",
				params: { configId: created.configId },
			});
		} catch (e) {
			setError(
				e instanceof ApiError
					? e.message
					: e instanceof Error
						? e.message
						: "Save failed",
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="space-y-6">
			<div>
				<div className="text-sm text-slate-500 mb-2">
					<Link to="/configs" className="hover:text-slate-900 no-underline">
						Experiments
					</Link>
					<span className="mx-2 text-slate-300">/</span>
					<span className="text-slate-900">New</span>
				</div>
				<h1 className="text-2xl font-semibold tracking-tight text-slate-900">
					New experiment
				</h1>
				<p className="text-sm text-slate-600 mt-1">
					Edit the YAML below and save. Leave Experiment ID blank to
					auto-generate one from the contents.
				</p>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<label htmlFor="new-config-id" className="text-sm text-slate-700">
					Experiment ID
				</label>
				<Input
					id="new-config-id"
					value={configId}
					onChange={(e) => setConfigId(e.target.value)}
					placeholder="optional"
					className="w-72"
				/>
				<div className="ml-auto flex items-center gap-2">
					<Link
						to="/configs"
						className="text-sm text-slate-600 hover:text-slate-900 no-underline"
					>
						Cancel
					</Link>
					<Button type="button" onClick={handleSave} disabled={saving}>
						{saving ? "Saving…" : "Save"}
					</Button>
				</div>
			</div>

			{error && (
				<p className="text-sm text-red-600 whitespace-pre-wrap">{error}</p>
			)}

			<YamlEditor value={yamlText} onChange={setYamlText} />
		</div>
	);
}
