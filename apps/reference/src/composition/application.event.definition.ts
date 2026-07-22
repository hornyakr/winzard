import { defineEvents } from '@/platform/events/contract';

export const applicationEvents = defineEvents({
  schemaVersion: 1,
  id: 'application.events',
  events: [
    {
      id: 'demo.lucky-number.generated',
      type: 'demo.lucky-number.generated',
      category: 'domain',
      version: 1,
      source: 'src/modules/demo/lucky-number/application/events/lucky-number-generated.event.ts',
      export: 'LuckyNumberGenerated',
      producer: 'src/modules/demo/lucky-number/application/commands/generate-lucky-number.ts',
      classification: 'internal',
      tenantScoped: false,
      aliases: [],
      handlers: [
        {
          id: 'demo.lucky-number.generated.record-trace',
          source: 'src/modules/demo/lucky-number/application/event-handlers/record-lucky-number-generated.ts',
          export: 'recordLuckyNumberGenerated',
          phase: 'observe',
          failurePolicy: 'log-and-continue',
          before: [],
          after: [],
          idempotent: true,
        },
      ],
    },
    {
      id: 'com.winzard.demo.lucky-number.generated.v1',
      type: 'com.winzard.demo.lucky-number.generated.v1',
      category: 'integration',
      version: 1,
      source: 'src/modules/demo/lucky-number/application/events/lucky-number-generated.event.ts',
      export: 'LuckyNumberGeneratedV1',
      producer: 'src/modules/demo/lucky-number/application/commands/generate-lucky-number.ts',
      payloadSchema: 'urn:winzard:schema:demo:lucky-number-generated:v1',
      classification: 'internal',
      tenantScoped: false,
      aliases: [],
      handlers: [],
    },
  ],
});
