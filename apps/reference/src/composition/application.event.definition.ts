import { defineEvents } from '@/platform/events/contract';

export const applicationEvents = defineEvents({
  schemaVersion: 1,
  id: 'demo.lucky-number.events',
  events: [
    {
      id: 'demo.lucky-number.generated',
      type: 'demo.lucky-number.generated',
      category: 'domain',
      version: 1,
      source: 'src/modules/demo/lucky-number/application/events/lucky-number-generated.event.ts',
      export: 'LuckyNumberGenerated',
      producer: 'src/modules/demo/lucky-number/application/commands/dispatch-lucky-number-generated.ts',
      payloadSchema: 'urn:schema:winzard:lucky-number-generated:v1',
      classification: 'internal',
      tenantScoped: false,
      aliases: [],
      handlers: [
        {
          id: 'demo.lucky-number.generated.record',
          source: 'src/modules/demo/lucky-number/application/event-handlers/record-lucky-number-generated.ts',
          export: 'recordLuckyNumberGenerated',
          phase: 'after-commit',
          failurePolicy: 'fail-fast',
          before: [],
          after: [],
          idempotent: true,
          maximumAttempts: 1,
        },
      ],
    },
  ],
});
