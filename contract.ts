/**
 * MediaTestModule Contract
 *
 * Zod schemas for all RPC method payloads.
 * Used by Kernel for request validation and manifest generation.
 */

import { z } from 'zod';

export const ListPayloadSchema = z.object({
    projectId:   z.number(),
    instanceKey: z.string().default('default'),
    options: z.object({
        limit:  z.number().optional(),
        // TODO: Add filterable fields, e.g.: status: z.string().optional()
    }).optional(),
});

export const GetByIdPayloadSchema = z.object({
    projectId:   z.number(),
    id:          z.string().uuid(),
    instanceKey: z.string().default('default'),
});

export const CreatePayloadSchema = z.object({
    projectId:   z.number(),
    instanceKey: z.string().default('default'),
    // TODO: Add required/optional fields for creation, e.g.:
    // name: z.string().min(1).max(255),
    metadata:    z.record(z.unknown()).optional(),
});

export const UpdatePayloadSchema = z.object({
    projectId:   z.number(),
    id:          z.string().uuid(),
    instanceKey: z.string().default('default'),
    // TODO: Add updatable fields (all optional), e.g.:
    // name: z.string().min(1).max(255).optional(),
    metadata:    z.record(z.unknown()).optional(),
});

export const DeletePayloadSchema = z.object({
    projectId:   z.number(),
    id:          z.string().uuid(),
    instanceKey: z.string().default('default'),
});

export type ListPayload    = z.infer<typeof ListPayloadSchema>;
export type GetByIdPayload = z.infer<typeof GetByIdPayloadSchema>;
export type CreatePayload  = z.infer<typeof CreatePayloadSchema>;
export type UpdatePayload  = z.infer<typeof UpdatePayloadSchema>;
export type DeletePayload  = z.infer<typeof DeletePayloadSchema>;
