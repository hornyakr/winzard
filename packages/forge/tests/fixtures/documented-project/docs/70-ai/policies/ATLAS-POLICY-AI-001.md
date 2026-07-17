---
schema_version: 1
id: ATLAS-POLICY-AI-001
title: "AI-assisted Delivery Policy"
aliases: []
scope: generated-project
kind: contract
subtype: policy
authority: normative
document_status: accepted
implementation_status: implemented
verification_status: not_applicable
owner: "role:project-owner"
approvers:
  - "role:project-owner"
classification: internal
ai_access: allowed
context_priority: required
created: 2026-07-17
updated: 2026-07-17
last_verified:
review_due:
applies_to:
  - **
depends_on: []
supersedes: []
superseded_by: []
evidence: []
tags:
  - ai
  - delivery
  - security
---

# AI-assisted Delivery Policy

## Summary

Project-level rules for human and AI-assisted changes.

## Contract

- AI execution requires an accepted task brief with a base commit, allowed paths and required checks.
- AI-generated ADRs and specifications remain proposed until human approval.
- Merge and release require an explicit integrator gate.
- Context access and tool permission are separate controls.

## Constraints and prohibitions

- Do not include secrets, customer data or complete chat transcripts in documentation or context packages.
- Do not modify generated adapters or consumer contracts manually.
- Do not continue when a forbidden path or destructive operation becomes necessary.

## Security requirements

- Missing approval enforcement fails closed.
- Restricted documents require explicit task-level access.
- The implementer cannot verify its own handoff as final evidence.

## Acceptance criteria

- [ ] AI adapters are generated from accepted project contracts.
- [ ] Context packages are deterministic and provenance-tracked.
- [ ] Task, handoff and review remain separately attributable.
