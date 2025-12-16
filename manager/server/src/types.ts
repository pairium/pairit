/**
 * Shared types for manager server
 */

export type ConfigDocument = {
    configId: string;
    owner: string;
    checksum: string;
    metadata: Record<string, unknown> | null;
    config: unknown;
    requireAuth?: boolean; // Optional auth for lab sessions
    createdAt?: Date;
    updatedAt: Date;
};

export type MediaUploadBody = {
    bucket?: string;
    object: string;
    checksum?: string;
    data: string;
    contentType?: string | null;
    metadata?: Record<string, unknown> | null;
    public?: boolean;
};

export type MediaListItem = {
    name: string;
    bucket: string;
    size?: number;
    updatedAt?: string | null;
    contentType?: string | null;
    publicUrl?: string;
    metadata?: Record<string, unknown> | null;
};
