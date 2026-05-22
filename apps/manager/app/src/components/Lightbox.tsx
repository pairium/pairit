import { useEffect } from "react";

export function Lightbox({
	src,
	alt,
	onClose,
}: {
	src: string;
	alt: string;
	onClose: () => void;
}) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		<div
			className="fixed inset-0 z-50 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-8"
			role="dialog"
			aria-modal="true"
			aria-label="Image preview"
		>
			<button
				type="button"
				onClick={onClose}
				className="absolute inset-0 cursor-zoom-out"
				aria-label="Close preview"
			/>
			<img
				src={src}
				alt={alt}
				className="relative max-h-full max-w-full rounded-lg shadow-2xl pointer-events-none"
			/>
		</div>
	);
}
