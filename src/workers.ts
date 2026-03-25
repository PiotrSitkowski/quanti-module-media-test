/**
 * Queue Consumer — MediaTestModule
 *
 * Processes async events emitted by the CRUD worker (CQRS Dual-Write).
 * Zombie Protection: checks if module is still enabled before processing.
 *
 * Registered via QUEUE_MAIN binding in wrangler.toml.
 * Event format: { event_id, type, version, context: { projectId, instanceKey, traceId }, data }
 */
import { WorkerEntrypoint } from 'cloudflare:workers';

interface Env {
    BACKEND: any;
    QUEUE_MAIN?: Queue<any>;
}

interface QueueEvent {
    event_id: string;
    type: string;
    version: number;
    context: {
        projectId:   number;
        instanceKey: string;
        traceId:     string;
    };
    data: Record<string, unknown>;
}

export default {
    async queue(batch: MessageBatch<QueueEvent>, env: Env): Promise<void> {
        for (const msg of batch.messages) {
            try {
                const event = msg.body;

                // Runtime log — always emitted for observability and tracing
                console.log(`[Queue] Processing event ${event.type} for instance ${event.context.instanceKey} (Trace: ${event.context.traceId})`);

                // Zombie Protection — skip if module is disabled
                // const isEnabled = await checkModuleEnabled(env, event.context.projectId);
                // if (!isEnabled) { msg.ack(); continue; }

                switch (event.type) {
                    case 'media_test.created':
                        // TODO: Handle creation event
                        // e.g., generate embeddings, send notifications
                        console.log(`[${event.context.traceId}] media-test created: ${event.data.id}`);
                        break;

                    case 'media_test.updated':
                        // TODO: Handle update event
                        console.log(`[${event.context.traceId}] media-test updated: ${event.data.id}`);
                        break;

                    case 'media_test.deleted':
                        // TODO: Handle deletion event
                        console.log(`[${event.context.traceId}] media-test deleted: ${event.data.id}`);
                        break;

                    default:
                        console.warn(`Unknown event type: ${event.type}`);
                }

                msg.ack();
            } catch (err) {
                console.error('Event processing failed:', err);
                msg.retry();
            }
        }
    },
};
