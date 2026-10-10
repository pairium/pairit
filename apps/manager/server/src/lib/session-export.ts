/**
 * Shape of one row in the sessions data export.
 */
import type { SessionDocument } from "../types";

export function toSessionExport(session: SessionDocument) {
	return {
		sessionId: session.id,
		configId: session.configId,
		currentPageId: session.currentPageId,
		status: session.endedAt ? "completed" : "in_progress",
		session_state: session.session_state ?? {},
		prolific: session.prolific ?? null,
		userId: session.userId ?? null,
		// Provenance; null for sessions created before it was recorded
		configRevision: session.configRevision ?? null,
		configChecksum: session.configChecksum ?? null,
		labVersion: session.labVersion ?? null,
		labRevision: session.labRevision ?? null,
		createdAt: session.createdAt?.toISOString() ?? null,
		updatedAt: session.updatedAt?.toISOString() ?? null,
		endedAt: session.endedAt ?? null,
	};
}
