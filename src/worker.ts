// @quanti-protocol: 3.5.1
// @quanti-module: media-test
// @quanti-domain: generic
// @quanti-constraints: no-joins, no-env-db, edge-10ms

/**
 * MediaTestModule — Fleet Worker (WorkerEntrypoint)
 *
 * CRUD for media_test via BACKEND.sys_executeDbQuery() proxy.
 * CQRS Dual-Write: every mutating operation emits a Queue event.
 *
 * Call chain: Backend → SVC.dispatch("SLOT_XXX", "list", ...) → this.list()
 * DB access:  this → BACKEND.sys_executeDbQuery(projectId, sql) → quanti-backend → D1 shard
 * Queue:      dot.notation events (media_test.created / .updated / .deleted)
 */

import { WorkerEntrypoint } from 'cloudflare:workers';

interface Env {
    BACKEND: any;
    QUEUE_MAIN?: Queue<any>;
}

function mapRaw(row: any) {
    return {
        id:          row.id,
        projectId:   row.project_id,
        instanceKey: row.instance_key || 'default',
        // TODO: Map module-specific columns here
        metadata:    row.metadata ? JSON.parse(row.metadata) : null,
        createdAt:   row.created_at ? new Date(row.created_at * 1000) : new Date(),
        updatedAt:   row.updated_at ? new Date(row.updated_at * 1000) : new Date(),
    };
}

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

    async list(traceId: string, payload: any): Promise<any[]> {
        const { projectId, instanceKey = 'default', options } = payload;
        if (!projectId) throw new Error('Missing projectId');

        const d = db(this.env, projectId, traceId);
        const limit = options?.limit || 50;
        const params: any[] = [projectId, instanceKey];
        let sql = 'SELECT * FROM media_test WHERE project_id = ? AND instance_key = ?';
        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);

        const result = await d.prepare(sql).bind(...params).all();
        return result.results.map(mapRaw);
    }

    async getById(traceId: string, payload: any): Promise<any | null> {
        const { projectId, id, instanceKey = 'default' } = payload;
        if (!projectId) throw new Error('Missing projectId');

        const result = await db(this.env, projectId, traceId)
            .prepare('SELECT * FROM media_test WHERE id = ? AND project_id = ? AND instance_key = ?')
            .bind(id, projectId, instanceKey).all();

        return result.results.length > 0 ? mapRaw(result.results[0]) : null;
    }

    async create(traceId: string, payload: any): Promise<any> {
        const { projectId, instanceKey = 'default', ...data } = payload;
        if (!projectId) throw new Error('Missing projectId');

        const id = crypto.randomUUID();
        const meta = data.metadata ? JSON.stringify(data.metadata) : null;

        // TODO: Adjust columns to match your schema.ts
        await db(this.env, projectId, traceId)
            .prepare(`INSERT INTO media_test (id, project_id, instance_key, metadata, created_at, updated_at)
                      VALUES (?, ?, ?, ?, unixepoch(), unixepoch())`)
            .bind(id, projectId, instanceKey, meta).run();


        if (this.env.QUEUE_MAIN) {
            this.ctx.waitUntil(
                this.env.QUEUE_MAIN.send({
                    event_id: crypto.randomUUID(),
                    type:     'media_test.created',
                    version:  1,
                    context:  { projectId, instanceKey, traceId },
                    data:     { id },
                })
            );
        }
        return this.getById(traceId, { projectId, instanceKey, id });
    }

    async update(traceId: string, payload: any): Promise<any | null> {
        const { projectId, id, instanceKey = 'default', ...data } = payload;
        if (!projectId) throw new Error('Missing projectId');

        const updates: string[] = [];
        const params: any[] = [];
        // TODO: Add updatable columns here, e.g.:
        // if (data.title !== undefined) { updates.push('title = ?'); params.push(data.title); }
        if (data.metadata !== undefined) { updates.push('metadata = ?'); params.push(JSON.stringify(data.metadata)); }
        if (updates.length === 0) return this.getById(traceId, { projectId, instanceKey, id });

        updates.push('updated_at = unixepoch()');
        params.push(projectId, instanceKey, id);
        await db(this.env, projectId, traceId)
            .prepare(`UPDATE media_test SET ${updates.join(', ')} WHERE project_id = ? AND instance_key = ? AND id = ?`)
            .bind(...params).run();


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

    async delete(traceId: string, payload: any): Promise<boolean> {
        const { projectId, id, instanceKey = 'default' } = payload;
        if (!projectId) throw new Error('Missing projectId');

        await db(this.env, projectId, traceId)
            .prepare('DELETE FROM media_test WHERE id = ? AND project_id = ? AND instance_key = ?')
            .bind(id, projectId, instanceKey).run();


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
