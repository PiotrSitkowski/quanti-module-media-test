# CQRS Patterns — Dual-Write Protocol

Version: 1.0
Enforced by: `quanti validate` (cqrs-dual-write rule)

## Zasada nadrzędna

Każda operacja modyfikująca dane (CREATE, UPDATE, DELETE) MUSI:
1. Zapisać dane do D1 przez `BACKEND.sys_executeDbQuery()`
2. Wyemitować zdarzenie na Queue (`QUEUE_MAIN`)

## Standardowy Event Payload

```typescript
this.env.QUEUE_MAIN.send({
    event_id: crypto.randomUUID(),
    type: 'module_name.entity_created',
    version: 1,
    context: {
        projectId,      // MUST — Tenant Isolation
        instanceKey,    // MUST — Polimorfizm klonów
        traceId,        // MUST — Distributed Tracing
    },
    data: { id, ...relevantFields }
});
```

## Queue Consumer (src/workers.ts)

Każdy moduł z bazą danych MUSI posiadać queue consumer.
Consumer przetwarza zdarzenia: wektoryzacja AI, powiadomienia, denormalizacja.

## Zombie Protection

Przed przetworzeniem zdarzenia sprawdź, czy moduł jest wciąż enabled.
Zdarzenie od wyłączonego modułu → `msg.ack()` bez przetwarzania.
