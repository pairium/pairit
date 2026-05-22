import { api, type MediaObject } from "@app/lib/api";
import { Lightbox } from "@components/Lightbox";
import { RefreshButton } from "@components/RefreshButton";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { useEffect, useRef, useState } from "react";

const IMAGE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"svg",
	"avif",
	"bmp",
]);

function isImage(name: string): boolean {
	const dot = name.lastIndexOf(".");
	if (dot < 0) return false;
	return IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			if (typeof result !== "string") {
				reject(new Error("Failed to read file"));
				return;
			}
			const comma = result.indexOf(",");
			resolve(comma >= 0 ? result.slice(comma + 1) : result);
		};
		reader.onerror = () => reject(reader.error ?? new Error("Read error"));
		reader.readAsDataURL(file);
	});
}

export function Media() {
	const [objects, setObjects] = useState<MediaObject[] | null>(null);
	const [prefix, setPrefix] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [preview, setPreview] = useState<{ src: string; alt: string } | null>(
		null,
	);
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [refreshing, setRefreshing] = useState(false);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const reload = async (p: string) => {
		setError(null);
		setRefreshing(true);
		try {
			setObjects(await api.listMedia(p || undefined));
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load");
		} finally {
			setRefreshing(false);
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
	useEffect(() => {
		reload("");
	}, []);

	const handleUpload = async (files: FileList | null) => {
		if (!files || files.length === 0) return;
		setUploadError(null);
		setUploading(true);
		try {
			for (const file of Array.from(files)) {
				const data = await fileToBase64(file);
				await api.uploadMedia(file.name, data, file.type || null);
			}
			await reload(prefix);
			if (fileInputRef.current) fileInputRef.current.value = "";
		} catch (e) {
			setUploadError(e instanceof Error ? e.message : "Upload failed");
		} finally {
			setUploading(false);
		}
	};

	const handleDelete = async (name: string) => {
		if (!confirm(`Delete "${name}"?`)) return;
		try {
			await api.deleteMedia(name);
			await reload(prefix);
		} catch (e) {
			alert(e instanceof Error ? e.message : "Delete failed");
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex justify-between items-start gap-3">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight text-slate-900">
						Media
					</h1>
					<p className="text-sm text-slate-600 mt-1">
						Files in the storage backend.
					</p>
				</div>
				<div className="pt-1">
					<RefreshButton
						onClick={() => reload(prefix)}
						refreshing={refreshing}
					/>
				</div>
			</div>

			<div className="flex flex-wrap gap-2 items-center">
				<form
					className="flex gap-2 flex-1 min-w-[20rem]"
					onSubmit={(e) => {
						e.preventDefault();
						reload(prefix);
					}}
				>
					<Input
						placeholder="Filter by prefix (optional)"
						value={prefix}
						onChange={(e) => setPrefix(e.target.value)}
						className="flex-1 max-w-md"
					/>
					<Button type="submit" variant="ghost">
						Filter
					</Button>
				</form>
				<div>
					<input
						ref={fileInputRef}
						type="file"
						multiple
						className="hidden"
						onChange={(e) => handleUpload(e.target.files)}
					/>
					<Button
						type="button"
						onClick={() => fileInputRef.current?.click()}
						disabled={uploading}
					>
						{uploading ? "Uploading…" : "Upload file"}
					</Button>
				</div>
			</div>
			{uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

			{error && <p className="text-sm text-red-600">{error}</p>}
			{!objects && !error && <p className="text-sm text-slate-500">Loading…</p>}
			{objects && objects.length === 0 && (
				<div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
					No media files.
				</div>
			)}
			{preview && (
				<Lightbox
					src={preview.src}
					alt={preview.alt}
					onClose={() => setPreview(null)}
				/>
			)}

			{objects && objects.length > 0 && (
				<div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
					<table className="w-full text-sm">
						<thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
							<tr>
								<th className="text-left px-4 py-2.5 font-medium">Object</th>
								<th className="px-4 py-2.5 font-medium" />
							</tr>
						</thead>
						<tbody>
							{objects.map((o) => {
								const image = o.publicUrl && isImage(o.name);
								const openPreview = () => {
									if (image && o.publicUrl)
										setPreview({ src: o.publicUrl, alt: o.name });
								};
								return (
									<tr
										key={o.name}
										className="border-t border-slate-100 hover:bg-slate-50"
									>
										<td className="px-4 py-2.5">
											<div className="flex items-center gap-3">
												{image ? (
													<button
														type="button"
														onClick={openPreview}
														className="w-10 h-10 rounded-md border border-slate-200 bg-slate-50 overflow-hidden shrink-0 cursor-zoom-in"
														aria-label={`Preview ${o.name}`}
													>
														<img
															src={o.publicUrl}
															alt=""
															className="w-full h-full object-cover"
															loading="lazy"
														/>
													</button>
												) : (
													<div className="w-10 h-10 rounded-md border border-slate-200 bg-slate-50 shrink-0" />
												)}
												{o.publicUrl ? (
													image ? (
														<button
															type="button"
															onClick={openPreview}
															className="font-mono text-[12px] text-slate-900 hover:underline text-left break-all"
														>
															{o.name}
														</button>
													) : (
														<a
															href={o.publicUrl}
															target="_blank"
															rel="noopener"
															className="font-mono text-[12px] text-slate-900 no-underline hover:underline break-all"
														>
															{o.name}
														</a>
													)
												) : (
													<span className="font-mono text-[12px] text-slate-800 break-all">
														{o.name}
													</span>
												)}
											</div>
										</td>
										<td className="px-4 py-2.5 text-right">
											<button
												type="button"
												onClick={() => handleDelete(o.name)}
												className="text-xs text-slate-500 hover:text-red-600"
											>
												Delete
											</button>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
