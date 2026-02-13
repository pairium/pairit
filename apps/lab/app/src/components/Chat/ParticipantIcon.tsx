/**
 * ParticipantIcon - Displays an icon for a chat participant
 */

import { getChatIcon } from "@app/lib/participant-icons";

type ParticipantIconProps = {
	senderId: string;
	senderType: "participant" | "agent" | "system";
	isOwn: boolean;
	size?: number;
	className?: string;
};

export function ParticipantIcon({
	senderId,
	senderType,
	isOwn,
	size = 20,
	className = "",
}: ParticipantIconProps) {
	const Icon = getChatIcon(senderId, senderType, isOwn);

	if (!Icon) {
		return null;
	}

	// Own messages get dark background to match bubble
	const bgClass = isOwn ? "bg-slate-700" : "bg-slate-100";
	const iconClass = isOwn ? "text-white" : "text-slate-600";

	return (
		<div
			className={`flex shrink-0 items-center justify-center rounded-full ${bgClass} ${className}`}
			style={{ width: size + 8, height: size + 8 }}
		>
			<Icon size={size} className={iconClass} />
		</div>
	);
}
