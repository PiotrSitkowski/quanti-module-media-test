/**
 * MediaTestModule Contract
 *
 * Zod schemas for all RPC method payloads.
 * Used by Kernel for request validation and manifest generation.
 */

import { z } from 'zod';

// ── Reusable sub-schemas ────────────────────────────────────────────────────

const MediaStatusSchema = z.enum(['PENDING', 'ACTIVE', 'DELETED']);

// ── List ────────────────────────────────────────────────────────────────────

export const ListPayloadSchema = z.object({
    projectId:   z.number(),
    instanceKey: z.string().default('default'),
    options: z.object({
        limit:       z.number().min(1).max(200).optional(),
        status:      MediaStatusSchema.optional(),
        contentType: z.string().optional(),
    }).optional(),
});

// ── GetById ─────────────────────────────────────────────────────────────────

export const GetByIdPayloadSchema = z.object({
    projectId:   z.number(),
    id:          z.string().uuid(),
    instanceKey: z.string().default('default'),
});

// ── Create (registers media after R2 upload) ─────────────────────────────────

export const CreatePayloadSchema = z.object({
    projectId:   z.number(),
    instanceKey: z.string().default('default'),
    // Original filename from the browser
    filename:    z.string().min(1).max(512),
    // MIME type of the uploaded file
    contentType: z.string().min(1).max(128),
    // File size in bytes
    size:        z.number().min(0),
    // R2 object key assigned by the presigned URL flow
    r2Key:       z.string().min(1).max(1024),
    // Optional alt text for accessibility
    alt:         z.string().max(255).optional(),
    metadata:    z.record(z.unknown()).optional(),
});

// ── Update ───────────────────────────────────────────────────────────────────

export const UpdatePayloadSchema = z.object({
    projectId:   z.number(),
    id:          z.string().uuid(),
    instanceKey: z.string().default('default'),
    // Updatable fields
    alt:         z.string().max(255).optional(),
    status:      MediaStatusSchema.optional(),
    metadata:    z.record(z.unknown()).optional(),
});

// ── Delete ───────────────────────────────────────────────────────────────────

export const DeletePayloadSchema = z.object({
    projectId:   z.number(),
    id:          z.string().uuid(),
    instanceKey: z.string().default('default'),
});

// ── Type exports ─────────────────────────────────────────────────────────────

export type ListPayload    = z.infer<typeof ListPayloadSchema>;
export type GetByIdPayload = z.infer<typeof GetByIdPayloadSchema>;
export type CreatePayload  = z.infer<typeof CreatePayloadSchema>;
export type UpdatePayload  = z.infer<typeof UpdatePayloadSchema>;
export type DeletePayload  = z.infer<typeof DeletePayloadSchema>;
