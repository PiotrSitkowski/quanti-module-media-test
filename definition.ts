/**
 * MediaTestModule Module Manifest
 *
 * SSoT for the Quanti Orchestrator. The runtime reads ONLY this file —
 * it never analyses TypeScript source code.
 *
 * RULES:
 *  - description MUST be >50 words (RAG/Vectorize discovery)
 *  - Bump schemaVersion whenever schema.ts changes (triggers auto-DDL at next tenant activation)
 *  - behaviorRules use JSON Logic — no hardcoded if/else in service.ts
 *  - configSchema fields must match configUi keys (enforced by `quanti validate`)
 */

import { z } from 'zod';

export const media_testDefinition = {
    id:            'media-test',
    name:          'Media Library',
    serviceType:   'content',
    schemaVersion: 2,
    version:       '1.1.0',
    icon:          'Image',

    description: `Moduł biblioteki mediów umożliwiający zarządzanie zdjęciami i plikami
        przechowywanymi w Cloudflare R2 Object Storage. Obsługuje upload plików
        przez presigned URL (przepływ CS-02: przeglądarka wysyła bezpośrednio na R2),
        przeglądanie galerii z podglądem miniatur, edycję metadanych (alt text) oraz
        miękkie usuwanie plików z synchronizacją zdarzeń przez Cloudflare Queue.
        Domain: content. Use it to: upload images, browse media gallery, manage metadata
        for media files scoped by project and instance.`,

    slots:         ['media_test_main_view', 'media_test_detail_panel', 'dashboard_widget'],
    permissions:   [],
    behaviorRules: [
        // Soft-delete only — R2 cleanup happens asynchronously via Queue consumer
        { 'if': [{ '==': [{ 'var': 'action' }, 'delete'] }, 'soft-delete', 'proceed'] },
    ],

    mcpTools: {
        create_media_test: {
            name:        'create_media_test',
            description: 'Registers a new media file entry in the database after a successful R2 presigned URL upload. Call this tool when the user uploads an image or file to their project media library and the binary upload to R2 is already complete.',
            tags:        ['Media Test', 'Upload', 'R2'],
            annotations: {
                title:           'Register Uploaded Media',
                readOnlyHint:    false,
                destructiveHint: false,
                idempotentHint:  false,
                openWorldHint:   false,
            },
            requiredContext: ['projectId', 'instanceKey'],
            emitsEvents:     ['media_test.created'],
        },
        list_media_test: {
            name:        'list_media_test',
            description: 'Lists all active media files in the project media library. Use this tool when the user wants to browse their uploaded images, find a specific file by name or type, or get an overview of the media library contents for a given project.',
            tags:        ['Media Test', 'Gallery'],
            annotations: {
                title:           'List Media Files',
                readOnlyHint:    true,
                destructiveHint: false,
                idempotentHint:  true,
                openWorldHint:   false,
            },
            requiredContext: ['projectId', 'instanceKey'],
            emitsEvents:     [],
        },
        update_media_test: {
            name:        'update_media_test',
            description: 'Updates editable metadata of an existing media file, such as the alt text for accessibility or the lifecycle status. Use this tool when the user wants to improve image descriptions or archive a media file without permanently deleting it.',
            tags:        ['Media Test', 'Metadata'],
            annotations: {
                title:           'Update Media Metadata',
                readOnlyHint:    false,
                destructiveHint: false,
                idempotentHint:  true,
                openWorldHint:   false,
            },
            requiredContext: ['projectId', 'instanceKey'],
            emitsEvents:     ['media_test.updated'],
        },
        delete_media_test: {
            name:        'delete_media_test',
            description: 'Soft-deletes a media file by setting its status to DELETED. The R2 object is cleaned up asynchronously by the Queue consumer. Use this tool when the user explicitly wants to remove a file from their media library permanently.',
            tags:        ['Media Test', 'Delete'],
            annotations: {
                title:           'Delete Media File',
                readOnlyHint:    false,
                destructiveHint: true,
                idempotentHint:  true,
                openWorldHint:   false,
            },
            requiredContext: ['projectId', 'instanceKey'],
            emitsEvents:     ['media_test.deleted'],
        },
    },

    dataSemantics: {
        createdAt: {
            semanticType: 'temporal',
            impact:       'neutral',
            unit:         'timestamp',
            description:  'ISO 8601 timestamp when the media file was uploaded and registered.',
        },
        size: {
            semanticType: 'quantity',
            impact:       'neutral',
            unit:         'bytes',
            description:  'File size in bytes. Used for storage quota calculations.',
        },
        status: {
            semanticType: 'lifecycle',
            impact:       'neutral',
            description:  'Lifecycle state of the media file: ACTIVE (visible), PENDING (processing), DELETED (soft-deleted).',
        },
    },

    // ─── Semantic Fabric ──────────────────────────────────────────────────────
    columnSemantics: {
        filename: {
            semanticType: 'label',
            aiHint:       'Original filename as provided by the user browser during upload.',
        },
        contentType: {
            semanticType: 'category',
            values:       ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
            aiHint:       'MIME type of the stored file. Filter by this field to find images only.',
        },
        size: {
            semanticType: 'quantity',
            unit:         'bytes',
            aggregatable: true,
            aiHint:       'File size in bytes. Sum for quota, divide by 1048576 for MB display.',
        },
        r2Key: {
            semanticType: 'reference',
            aiHint:       'R2 object key in the format proj_{id}/{year}/{month}/{uuid}.{ext}. Never expose directly to users.',
        },
        alt: {
            semanticType: 'label',
            aiHint:       'Accessibility alt text. Suggest AI-generated description if empty.',
        },
        status: {
            semanticType: 'lifecycle',
            values:       ['PENDING', 'ACTIVE', 'DELETED'],
            transitions:  'PENDING→ACTIVE, ACTIVE→DELETED',
            aiHint:       'Only ACTIVE files are visible in gallery. DELETED files are cleaned up from R2 asynchronously.',
        },
    },

    processGraph: {
        participatesIn: [
            {
                processId:   'media-lifecycle',
                role:        'creator',
                description: 'Creates and manages media file entries after R2 upload, emitting media_test.created event to trigger downstream processing.',
                step:        1,
                totalSteps:  3,
            },
            {
                processId:   'r2-cleanup',
                role:        'data-source',
                description: 'Provides soft-deleted media records for the R2 cleanup Queue consumer to remove orphaned objects from storage.',
                step:        2,
                totalSteps:  2,
            },
        ],

        automations: [
            {
                name:      'soft-delete-r2-cleanup',
                trigger:   { event: 'media_test.deleted' },
                condition: { '==': [{ 'var': 'data.status' }, 'DELETED'] },
                action:    { module: 'media-test', method: 'triggerR2Cleanup', mapping: { id: 'data.id', r2Key: 'data.r2Key' } },
            },
        ],

        relations: [],
    },

    uiExtensions: [
        {
            slot:      'media_test_main_view',
            component: 'MediaTestTable',
            priority:  10,
            description: 'Main media gallery view displaying all uploaded images for a project as a responsive grid with thumbnail previews. Enables users to upload new images via presigned R2 URL, browse existing media, and trigger file deletion with confirmation modal.',
        },
        {
            slot:      'media_test_detail_panel',
            component: 'MediaTestDetailPanel',
            priority:  10,
            description: 'Side panel showing full metadata of the currently selected media file including filename, size, MIME type, upload date and editable alt text. Provides save and soft-delete actions. Panel is empty when no file is selected in the gallery.',
        },
        {
            slot:      'dashboard_widget',
            component: 'MediaTestDashboardWidget',
            priority:  10,
            description: 'Dashboard tile for the media library module showing total file count and number of files uploaded in the last seven days. Uses pre-loaded Kernel snapshot data — no additional RPC calls on mount. Clicking the action button navigates to the full gallery view.',
        },
    ],
} as const;

export type MediaTestModuleDefinition = typeof media_testDefinition;

// ─── Module Configuration Schema ──────────────────────────────────────────────
export const configSchema = z.object({
    // Maximum file size in MB allowed for upload
    maxFileSizeMb:    z.number().min(1).max(100).default(10),
    // Allowed MIME types (comma-separated)
    allowedMimeTypes: z.string().default('image/jpeg,image/png,image/webp,image/gif'),
    // Gallery items per page
    itemsPerPage:     z.number().min(10).max(200).default(50),
    // Enable alt text AI suggestions (requires AI capability)
    enableAiAlt:      z.boolean().default(false),
});

// ─── Configuration UI Hints ───────────────────────────────────────────────────
export const configUi: Record<string, { label: string; widget: string; showIf?: unknown }> = {
    maxFileSizeMb:    { label: 'Max file size (MB)',      widget: 'slider' },
    allowedMimeTypes: { label: 'Allowed MIME types',      widget: 'text' },
    itemsPerPage:     { label: 'Gallery items per page',  widget: 'slider' },
    enableAiAlt:      { label: 'AI alt text suggestions', widget: 'toggle' },
};
