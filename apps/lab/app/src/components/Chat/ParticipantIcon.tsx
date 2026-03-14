/**
 * ParticipantIcon - Displays an icon or image for a chat participant
 */

import type { ChatAvatarOverrides } from "@app/lib/participant-icons";
import { resolveChatAvatar } from "@app/lib/participant-icons";

type ParticipantIconProps = {
	senderId: string;
	senderType: "participant" | "agent" | "system";
	isOwn: boolean;
	avatars?: ChatAvatarOverrides;
	size?: number;
	className?: string;
};

export function ParticipantIcon({
	senderId,
	senderType,
	isOwn,
	avatars,
	size = 20,
	className = "",
}: ParticipantIconProps) {
	const avatar = resolveChatAvatar({ senderId, senderType, isOwn, avatars });

	if (!avatar) {
		return null;
	}

	const bgClass = isOwn ? "bg-slate-700" : "bg-slate-100";
	const iconClass = isOwn ? "text-white" : "text-slate-600";
	const wrapperStyle = { width: size + 8, height: size + 8 };

	return (
		<div
			className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full ${bgClass} ${className}`}
			style={wrapperStyle}
		>
			{avatar.type === "image" ? (
				<img
					src={avatar.src}
					alt=""
					className="h-full w-full object-cover"
				/>
			) : (
				<avatar.icon size={size} className={iconClass} />
			)}
		</div>
	);
}
