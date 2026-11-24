/**
 * The module announces every RPC method its worker implements, in `definition.ts` — the source.
 *
 * Until 2026-11-24 the five methods were declared only in an UNTRACKED `quanti.manifest.json` (a build
 * artefact): when the checkout was reset to origin/main the file went, and the kernel's
 * `check-undeclared-rpc-methods` saw "implemented, never announced: create, delete, getById, list, update".
 */
import { describe, it, expect } from 'vitest';
import { media_testDefinition } from './definition.js';

describe('media-test contract — what the worker implements, the definition declares', () => {
  it('declares the five RPC methods', () => {
    const declared = (media_testDefinition as unknown as { contract?: { methods?: string[] } }).contract?.methods ?? [];
    expect([...declared].sort()).toEqual(['create', 'delete', 'getById', 'list', 'update']);
  });
  // The class of this error — any worker method without a declaration — is guarded fleet-wide by the
  // kernel's scripts/check-undeclared-rpc-methods.ts; it is not re-implemented here.
});
