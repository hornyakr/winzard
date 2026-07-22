import { defineComposition } from '@/platform/composition/contract';

export const eventComposition = defineComposition({
  schemaVersion: 1,
  id: 'demo.events',
  capability: 'event-dispatching',
  roots: [
    {
      id: 'demo.events.root',
      source: 'src/composition/demo.server.ts',
      export: 'demoModule',
      runtime: 'nodejs',
      services: [
        'demo.events.dispatcher',
        'demo.events.trace',
        'demo.events.handler.record-generated',
      ],
    },
  ],
  services: [
    {
      id: 'demo.events.handler.record-generated',
      kind: 'application',
      implementation: 'recordLuckyNumberGenerated',
      source: 'src/modules/demo/lucky-number/application/event-handlers/record-lucky-number-generated.ts',
      export: 'recordLuckyNumberGenerated',
      lifetime: 'process',
      runtime: 'universal',
      visibility: 'private',
      dependencies: [],
      tags: ['event-handler'],
    },
    {
      id: 'demo.events.trace',
      kind: 'platform',
      implementation: 'RecordingEventDispatchTrace',
      source: 'src/platform/events/recording-trace.ts',
      export: 'RecordingEventDispatchTrace',
      lifetime: 'process',
      runtime: 'universal',
      visibility: 'private',
      dependencies: [],
    },
    {
      id: 'demo.events.dispatcher',
      kind: 'platform',
      implementation: 'SequentialDomainEventDispatcher',
      port: 'DomainEventDispatcher',
      source: 'src/platform/events/dispatcher.ts',
      export: 'SequentialDomainEventDispatcher',
      lifetime: 'process',
      runtime: 'universal',
      visibility: 'private',
      dependencies: [
        'demo.events.handler.record-generated',
        'demo.events.trace',
      ],
    },
  ],
});
