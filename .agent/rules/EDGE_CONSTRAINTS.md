# Edge Runtime Constraints

## CPU Limit
Cloudflare Workers mają limit 10ms CPU. Operacje > 500ms → wypchnij na Queue/Workflow.

## Zakaz node:* importów
Workers V8 Isolate nie obsługuje Node.js API.
ZAKAZ: import { readFileSync } from 'node:fs'
ZAKAZ: import crypto from 'node:crypto'
OK: import { WorkerEntrypoint } from 'cloudflare:workers'
OK: crypto.randomUUID() (Web Crypto API)

## Bindings, nie zmienne środowiskowe
Dostęp do zasobów (Queue, KV, R2): env.BINDING_NAME
Sekrety: env.SECRET_NAME (z wrangler.toml [vars] lub dashboard)
NIGDY: process.env.* (nie istnieje w Workers)

## WebCrypto zamiast node:crypto
Hashowanie: crypto.subtle.digest('SHA-256', data)
UUID: crypto.randomUUID()
Scrypt: WYMAGANY dla haseł (Argon2id ZABRONIONY — wymaga native C++)
