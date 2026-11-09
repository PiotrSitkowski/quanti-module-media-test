/**
 * H-ERROR-NOT-IN-AE — the queue consumer: an event that failed (and is retried) is reported as an ERROR row by CODE.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {} }));

const { default: consumer } = await import('./workers');

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe('queue consumer', () => {
    it('a failed event → MEDIA_TEST_QUEUE_EVENT_FAILED with its trace, and the message is retried', async () => {
        const pending: Promise<unknown>[] = [];
        const env = { BACKEND: { system_logEvent: vi.fn(async (..._a: unknown[]) => {}) } };
        // `context` missing → reading `event.context.instanceKey` throws inside the try.
        const msg = { body: { type: 'media_test.created', data: { id: 'x' } }, ack: vi.fn(), retry: vi.fn() };

        await consumer.queue({ messages: [msg] } as never, env as never, { waitUntil: (p: Promise<unknown>) => { pending.push(p); } } as never);
        await Promise.all(pending);

        expect(msg.retry).toHaveBeenCalled();
        expect(env.BACKEND.system_logEvent).toHaveBeenCalledWith('no-trace', 'module:media-test', 'ERROR', 'MEDIA_TEST_QUEUE_EVENT_FAILED', expect.objectContaining({ operation: 'queue' }));
    });
});
