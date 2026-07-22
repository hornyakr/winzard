# Persistence schema inventory

Inventory fingerprint: `b6573893efea12d7c14a2c22864cb63739588b521080cd3a6de380fc704022e8`
Schema fingerprint: `6eaef4690ac6ab00e28d1b6ab4973ab94d99e09c1aaeec89e759e9c869f15f9b`
Provider: `postgresql`

## Models

### DeadLetterMessage

| Field | Type | Required | Attributes |
| --- | --- | --- | --- |
| id | String | yes | id |
| outboxId | String | yes | unique |
| source | String | yes |  |
| type | String | yes |  |
| attempts | Int | yes |  |
| errorCode | String | yes |  |
| payloadHash | String | yes |  |
| correlationId | String | no |  |
| createdAt | DateTime | yes |  |

Indexes: `type, createdAt`

### InboxMessage

| Field | Type | Required | Attributes |
| --- | --- | --- | --- |
| consumerId | String | yes |  |
| source | String | yes |  |
| eventId | String | yes |  |
| processedAt | DateTime | yes |  |
| resultHash | String | no |  |

Indexes: -

### OutboxMessage

| Field | Type | Required | Attributes |
| --- | --- | --- | --- |
| id | String | yes | id |
| source | String | yes |  |
| type | String | yes |  |
| subject | String | no |  |
| occurredAt | DateTime | yes |  |
| aggregateId | String | no |  |
| aggregateSequence | BigInt | no |  |
| payload | Json | yes |  |
| metadata | Json | yes |  |
| status | String | yes |  |
| attempts | Int | yes |  |
| availableAt | DateTime | yes |  |
| lockedAt | DateTime | no |  |
| lockedBy | String | no |  |
| publishedAt | DateTime | no |  |
| lastErrorCode | String | no |  |
| createdAt | DateTime | yes |  |

Indexes: `status, availableAt`, `lockedAt`, `aggregateId, aggregateSequence`
