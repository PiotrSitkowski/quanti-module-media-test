// @quanti-protocol: 3.5.1
// @quanti-module: media-test
// @quanti-domain: generic
// @quanti-constraints: no-joins, no-env-db, edge-10ms

/**
 * MediaTestModule — Fleet Worker (WorkerEntrypoint)
 *
 * CRUD for media library entries via BACKEND.sys_executeDbQuery() proxy.
 * CQRS Dual-Write: every mutating operation emits a Queue event.
 *
 * Call chain: Backend → SVC.dispatch("SLOT_XXX", "list", ...) → this.list()
 * DB access:  this → BACKEND.sys_executeDbQuery(projectId, sql) → quanti-backend → D1 shard
 * Queue:      dot.notation events (media_test.created / .updated / .deleted)
 *
 * R2 Upload pattern (CS-02):
 *   - Frontend requests presigned URL via context.api.rpc (goes to Kernel media service)
 *   - Browser uploads directly to R2 using the presigned URL
 *   - After upload, frontend calls this.create() to register metadata in D1
 */

import { WorkerEntrypoint } from 'cloudflare:workers';

interface Env {
    BACKEND: any;
    QUEUE_MAIN?: Queue<any>;
}

// ── Row mapper: D1 snake_case → camelCase DTO ─────────────────────────────────
function mapRaw(row: any) {
    return {
        id:          row.id,
        projectId:   row.project_id,
        instanceKey: row.instance_key || 'default',
        filename:    row.filename,
        contentType: row.content_type,
        size:        row.size ?? 0,
        r2Key:       row.r2_key,
        alt:         row.alt ?? null,
        status:      row.status ?? 'ACTIVE',
        metadata:    row.metadata ? JSON.parse(row.metadata) : null,
        createdAt:   row.created_at ? new Date(row.created_at * 1000).toISOString() : new Date().toISOString(),
        updatedAt:   row.updated_at ? new Date(row.updated_at * 1000).toISOString() : new Date().toISOString(),
    };
}

// ── D1 proxy via BACKEND.sys_executeDbQuery ───────────────────────────────────
function db(env: Env, projectId: number, traceId?: string) {
    const backend = env.BACKEND;
    return {
        prepare(sql: string) {
            const args: any[] = [];
            return {
                bind(...params: any[]) { args.push(...params); return this; },
                async all() { return backend.sys_executeDbQuery(projectId, { sql, params: args, method: 'all', traceId }); },
                async run() { return backend.sys_executeDbQuery(projectId, { sql, params: args, method: 'run', traceId }); },
            } as any;
        },
    };
}

export default class MediaTestModule extends WorkerEntrypoint<Env> {

    async fetch(_req: Request): Promise<Response> {
        return Response.json({ module: 'quanti-module-media-test', status: 'ok' });
    }

    // ── list: returns paginated media items for a project ─────────────────────
    async list(traceId: string, payload: any): Promise<any[]> {
        const { projectId, instanceKey = 'default', options } = payload;
        if (!projectId) throw new Error('Missing projectId');

        const d      = db(this.env, projectId, traceId);
        const limit  = options?.limit ?? 50;
        const params: any[] = [projectId, instanceKey];
        let sql = 'SELECT * FROM media_test WHERE project_id = ? AND instance_key = ?';

        if (options?.status) {
            sql += ' AND status = ?';
            params.push(options.status);
        } else {
            // Default: exclude soft-deleted items
            sql += " AND status != 'DELETED'";
        }

        if (options?.contentType) {
            sql += ' AND content_type = ?';
            params.push(options.contentType);
        }

        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);

        const result = await d.prepare(sql).bind(...params).all();
        return result.results.map(mapRaw);
    }

    // ── getById ────────────────────────────────────────────────────────────────
    async getById(traceId: string, payload: any): Promise<any | null> {
        const { projectId, id, instanceKey = 'default' } = payload;
        if (!projectId) throw new Error('Missing projectId');

        const result = await db(this.env, projectId, traceId)
            .prepare('SELECT * FROM media_test WHERE id = ? AND project_id = ? AND instance_key = ?')
            .bind(id, projectId, instanceKey).all();

        return result.results.length > 0 ? mapRaw(result.results[0]) : null;
    }

    // ── create: registers media metadata after successful R2 upload ────────────
    async create(traceId: string, payload: any): Promise<any> {
        const {
            projectId,
            instanceKey = 'default',
            filename,
            contentType,
            size        = 0,
            r2Key,
            alt,
            metadata,
        } = payload;
        if (!projectId)   throw new Error('Missing projectId');
        if (!filename)    throw new Error('Missing filename');
        if (!contentType) throw new Error('Missing contentType');
        if (!r2Key)       throw new Error('Missing r2Key');

        const id   = crypto.randomUUID();
        const meta = metadata ? JSON.stringify(metadata) : null;

        await db(this.env, projectId, traceId)
            .prepare(`INSERT INTO media_test
                        (id, project_id, instance_key, filename, content_type, size, r2_key, alt, status, metadata, created_at, updated_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, unixepoch(), unixepoch())`)
            .bind(id, projectId, instanceKey, filename, contentType, size, r2Key, alt ?? null, meta)
            .run();

        if (this.env.QUEUE_MAIN) {
            this.ctx.waitUntil(
                this.env.QUEUE_MAIN.send({
                    event_id: crypto.randomUUID(),
                    type:     'media_test.created',
                    version:  1,
                    context:  { projectId, instanceKey, traceId },
                    data:     { id, filename, contentType, size, r2Key },
                })
            );
        }

        return this.getById(traceId, { projectId, instanceKey, id });
    }

    // ── update: update alt text or status ────────────────────────────────────
    async update(traceId: string, payload: any): Promise<any | null> {
        const { projectId, id, instanceKey = 'default', alt, status, metadata } = payload;
        if (!projectId) throw new Error('Missing projectId');

        const updates: string[] = [];
        const params:  any[]    = [];

        if (alt      !== undefined) { updates.push('alt = ?');      params.push(alt); }
        if (status   !== undefined) { updates.push('status = ?');   params.push(status); }
        if (metadata !== undefined) { updates.push('metadata = ?'); params.push(JSON.stringify(metadata)); }

        if (updates.length === 0) return this.getById(traceId, { projectId, instanceKey, id });

        updates.push('updated_at = unixepoch()');
        params.push(projectId, instanceKey, id);

        await db(this.env, projectId, traceId)
            .prepare(`UPDATE media_test SET ${updates.join(', ')} WHERE project_id = ? AND instance_key = ? AND id = ?`)
            .bind(...params)
            .run();

        if (this.env.QUEUE_MAIN) {
            this.ctx.waitUntil(
                this.env.QUEUE_MAIN.send({
                    event_id: crypto.randomUUID(),
                    type:     'media_test.updated',
                    version:  1,
                    context:  { projectId, instanceKey, traceId },
                    data:     { id },
                })
            );
        }

        return this.getById(traceId, { projectId, instanceKey, id });
    }

    // ── delete: soft-delete (sets status = 'DELETED') ─────────────────────────
    async delete(traceId: string, payload: any): Promise<boolean> {
        const { projectId, id, instanceKey = 'default' } = payload;
        if (!projectId) throw new Error('Missing projectId');

        // Soft delete — R2 object cleanup handled by a Queue consumer
        await db(this.env, projectId, traceId)
            .prepare(`UPDATE media_test SET status = 'DELETED', updated_at = unixepoch()
                      WHERE id = ? AND project_id = ? AND instance_key = ?`)
            .bind(id, projectId, instanceKey)
            .run();

        if (this.env.QUEUE_MAIN) {
            this.ctx.waitUntil(
                this.env.QUEUE_MAIN.send({
                    event_id: crypto.randomUUID(),
                    type:     'media_test.deleted',
                    version:  1,
                    context:  { projectId, instanceKey, traceId },
                    data:     { id },
                })
            );
        }

        return true;
    }
}
