/**
 * Auth types for Better Auth integration
 */

export type User = {
	id: string;
	email: string;
	emailVerified: boolean;
	name: string;
	image?: string | null;
	createdAt: Date;
	updatedAt: Date;
};

export type Session = {
	id: string;
	userId: string;
	expiresAt: Date;
	token: string;
	ipAddress?: string | null;
	userAgent?: string | null;
};

export type AuthContext = {
	user: User | null;
	session: Session | null;
};
