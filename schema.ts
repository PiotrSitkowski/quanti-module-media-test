// @quanti-protocol: 3.5.1
// @quanti-module: media-test
// @quanti-domain: generic
// @quanti-constraints: no-joins, no-env-db, edge-10ms

/**
 * MediaTestModule Drizzle Schema
 *
 * IMPORTANT: This schema is a DECLARATIVE definition.
 * Tables are NOT created from this file directly.
 * The Quanti system reads this schema and auto-provisions tables
 * when the module is activated for a tenant (Lazy Provisioning).
 *
 * DO NOT create manual migrations — bump schemaVersion in definition.ts instead.
 *
 * MANDATORY columns (v4.0 Fleet Protocol — never remove):
 *   id           → Primary key (UUID)
 *   project_id   → Tenant isolation (Anti-IDOR)
 *   instance_key → Module-clone polymorphism (default: 'default')
 *   metadata     → JSON flexible attributes
 *
 * Add module-specific columns BELOW the mandatory block.
 * Bump schemaVersion in definition.ts after every schema change.
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const media_testTable = sqliteTable(
    'media_test',
    {
        // ── Mandatory columns (DO NOT remove) ──────────────────────────────────
        id:          text('id').primaryKey(),
        projectId:   integer('project_id').notNull(),
        instanceKey: text('instance_key').notNull().default('default'),
        metadata:    text('metadata', { mode: 'json' }),

        // ── Media-specific columns ──────────────────────────────────────────────
        // Original filename as uploaded by user
        filename:    text('filename').notNull(),
        // MIME type e.g. 'image/jpeg', 'image/png', 'image/webp'
        contentType: text('content_type').notNull(),
        // File size in bytes
        size:        integer('size').notNull().default(0),
        // R2 object key — path within the bucket e.g. 'proj_42/2026/03/uuid.jpg'
        r2Key:       text('r2_key').notNull(),
        // Alt text for accessibility and AI search
        alt:         text('alt'),
        // Status lifecycle: 'PENDING' | 'ACTIVE' | 'DELETED'
        status:      text('status').notNull().default('ACTIVE'),

        // ── Timestamps ──────────────────────────────────────────────────────────
        createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
    },
    (table) => ({
        projectIdx:     index('media_test_project_idx').on(table.projectId),
        instanceKeyIdx: index('media_test_instance_key_idx').on(table.projectId, table.instanceKey),
        statusIdx:      index('media_test_status_idx').on(table.projectId, table.status),
    }),
);

export type InsertMediaTestModule = typeof media_testTable.$inferInsert;
export type SelectMediaTestModule = typeof media_testTable.$inferSelect;
