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
    name:          'Media Test',
    serviceType:   'content',
    schemaVersion: 1,
    version:       '1.0.0',
    icon:          'Box',

    description: `Moduł testowy do zarządzania biblioteką zdjęć w storage object R2

        Domain: generic. This module manages media-test records for the Quanti platform.
        Use it to: list, create, update and delete media_test entries scoped by project and instance.`,

    slots:         ['media_test_main_view', 'media_test_detail_panel', 'dashboard_widget'],
    permissions:   [],
    behaviorRules: [
        // TODO: Add JSON Logic rules here — no hardcoded if/else in service.ts
    ],

    mcpTools: {
        create_media_test: {
            name:        'create_media_test',
            description: 'TODO: Describe when the AI should use this tool to create a media-test record.',
            tags:        ['Media Test'],
            // MCP-native annotations (spec 2024-11-05)
            annotations: {
                title:           'Create Media Test',
                readOnlyHint:    false,
                destructiveHint: false,
                idempotentHint:  false,
                openWorldHint:   false,
            },
            // Context required by the MCP Gateway dispatcher
            requiredContext: ['projectId', 'instanceKey'],
            // Queue events emitted after this tool call (for AI orchestration awareness)
            emitsEvents: ['media_test.created'],
        },
        list_media_test: {
            name:        'list_media_test',
            description: 'TODO: Describe when the AI should use this tool to list media-test records.',
            tags:        ['Media Test'],
            annotations: {
                title:           'List Media Test',
                readOnlyHint:    true,  // Does not modify data
                destructiveHint: false,
                idempotentHint:  true,
                openWorldHint:   false,
            },
            requiredContext: ['projectId', 'instanceKey'],
            emitsEvents: [],
        },
        update_media_test: {
            name:        'update_media_test',
            description: 'TODO: Describe when the AI should use this tool to update a media-test record.',
            tags:        ['Media Test'],
            annotations: {
                title:           'Update Media Test',
                readOnlyHint:    false,
                destructiveHint: false,
                idempotentHint:  true,
                openWorldHint:   false,
            },
            requiredContext: ['projectId', 'instanceKey'],
            emitsEvents: ['media_test.updated'],
        },
        delete_media_test: {
            name:        'delete_media_test',
            description: 'TODO: Describe when the AI should use this tool to delete a media-test record.',
            tags:        ['Media Test'],
            annotations: {
                title:           'Delete Media Test',
                readOnlyHint:    false,
                destructiveHint: true,  // Permanently removes data
                idempotentHint:  true,
                openWorldHint:   false,
            },
            requiredContext: ['projectId', 'instanceKey'],
            emitsEvents: ['media_test.deleted'],
        },
    },

    dataSemantics: {
        // TODO: Describe your data fields for AI understanding, e.g.:
        // status: {
        //     semanticType: 'status',
        //     impact:       'neutral',
        //     description:  'Lifecycle state of the record',
        // },
        createdAt: {
            semanticType: 'temporal',
            impact:       'neutral',
            unit:         'timestamp',
            description:  'Creation date of the record.',
        },
    },

    // ─── Semantic Fabric (Vision 2027 — Punkt 2) ──────────────────────────────
    // Describes which business processes this module participates in and how it
    // relates to other modules. Used by the Process Vectorizer to build a semantic
    // process graph indexed in Cloudflare Vectorize.

    columnSemantics: {
        // TODO: Add AI-readable semantics for key columns, e.g.:
        // totalAmount: {
        //     semanticType: 'monetary',
        //     unit:         'minor_unit',     // ISO 4217 minor unit (grosz, cent)
        //     currency:     { from: 'metadata.currency', default: 'PLN' },
        //     aggregatable: true,
        //     displayFormat: '{value/100} {currency}',
        //     aiHint: 'Always divide by 100 for display.',
        // },
        // status: {
        //     semanticType: 'lifecycle',
        //     values:      ['DRAFT', 'ACTIVE', 'ARCHIVED'],
        //     transitions: 'DRAFT→ACTIVE→ARCHIVED',
        //     aiHint:      'Status follows a strict lifecycle. Never skip states.',
        // },
        // dueDate: {
        //     semanticType: 'deadline',
        //     timezone:     'project',
        //     businessRule: 'Approaching deadlines should trigger notifications.',
        //     aiHint:       'Critical date field. Check against current time.',
        // },
    },

    processGraph: {
        // Processes this module participates in.
        // The Process Vectorizer indexes each entry as a vector node.
        participatesIn: [
            // {
            //     processId:   'invoice-lifecycle',
            //     role:        'creator',           // creator | transformer | distributor | monitor | data-source
            //     description: 'Creates the media-test document and emits media_test.created event.',
            //     step:        1,
            //     totalSteps:  3,
            // },
        ],

        // Event-driven automations (JsonLogic conditions — no hardcoded if/else).
        automations: [
            // {
            //     name:      'example-automation',
            //     trigger:   { event: 'media_test.created' },
            //     condition: { '==': [{ 'var': 'data.status' }, 'confirmed'] },
            //     action:    { module: 'target-module', method: 'handle', mapping: {} },
            // },
        ],

        // Semantic relations to other Fleet modules.
        relations: [
            // { target: 'categories', relation: 'uses',     instanceKey: 'media_test-types', description: 'Category classification' },
            // { target: 'contacts',   relation: 'reads',    description: 'Owner / contact data' },
            // { target: 'email-sender', relation: 'triggers', event: 'media_test.created', description: 'Notify on creation' },
        ],
    },

    uiExtensions: [
        {
            slot:      'media_test_main_view',
            component: 'MediaTestTable',
            priority:  10,
            // MANDATORY (quanti analyze — documentation-debt rule):
            // Describe the business logic of this component in ≥10 words.
            // Placeholder "TODO" values will block quanti analyze and quanti deploy.
            description: 'TODO: Describe what MediaTestTable displays, when it is shown, and what user actions it enables.',
        },
        {
            slot:      'media_test_detail_panel',
            component: 'MediaTestDetailPanel',
            priority:  10,
            // MANDATORY (quanti analyze — documentation-debt rule):
            // Describe the business logic of this component in ≥10 words.
            // Placeholder "TODO" values will block quanti analyze and quanti deploy.
            description: 'TODO: Describe what MediaTestDetailPanel displays, when it is shown, and what user actions it enables.',
        },
        {
            slot:      'dashboard_widget',
            component: 'MediaTestDashboardWidget',
            priority:  10,
            // MANDATORY (quanti analyze — documentation-debt rule):
            // Describe the business logic of this component in ≥10 words.
            // Placeholder "TODO" values will block quanti analyze and quanti deploy.
            description: 'TODO: Describe what MediaTestDashboardWidget displays, when it is shown, and what user actions it enables.',
        },
    ],
} as const;

export type MediaTestModuleDefinition = typeof media_testDefinition;

// ─── Module Configuration Schema ──────────────────────────────────────────────
// Defines the structure of settings editable by the tenant admin.
// Platform Admin UI auto-generates a form from this schema.
// Keys MUST match configUi below (enforced by `quanti validate`).
export const configSchema = z.object({
    // TODO: Add module configuration fields, e.g.:
    // theme:        z.enum(['light', 'dark']).default('light'),
    // itemsPerPage: z.number().min(5).max(100).default(25),
    // enableExport: z.boolean().default(false),
});

// ─── Configuration UI Hints ───────────────────────────────────────────────────
// Controls labels, widget types, and conditional visibility (showIf via json_logic).
// Keys MUST match configSchema fields above.
export const configUi: Record<string, { label: string; widget: string; showIf?: unknown }> = {
    // TODO: Add UI hints for each configSchema field, e.g.:
    // theme:        { label: 'Color Theme', widget: 'select' },
    // itemsPerPage: { label: 'Items per page', widget: 'slider' },
    // enableExport: { label: 'Enable CSV Export', widget: 'toggle' },
};
