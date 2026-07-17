---
schema_version: 1
id: ATLAS-TASK-0001
title: "Implement catalog filter"
aliases: []
scope: generated-project
kind: delivery
subtype: task-brief
authority: normative
document_status: accepted
implementation_status: not_started
verification_status: unverified
owner: "role:project-owner"
approvers:
  - "role:project-owner"
classification: internal
ai_access: allowed
context_priority: relevant
created: 2026-07-17
updated: 2026-07-17
last_verified:
review_due:
applies_to: []
depends_on: []
supersedes: []
superseded_by: []
evidence: []
tags: []
related_capabilities: []
related_decisions: []
related_specifications: []
base_commit: 5906d58b6617439c14dae55817f3e724cd8f32df
allowed_paths:
  - src/**
  - tests/**
forbidden_paths:
  - docs/80-winzard/**
  - docs/90-generated/**
required_checks:
  - "pnpm typecheck"
  - "pnpm test"
  - "pnpm forge check"
allowed_tools:
  - filesystem.read
  - "filesystem.write:allowed_paths"
  - "shell:required_checks"
denied_tools:
  - secret.read
  - production.deploy
  - database.destructive
risk: medium
human_approval: before_merge
---

# Implement catalog filter

## Outcome

A validated catalog filter query is available.

## Non-goals

- No database migration or authentication change.

## Context

The catalog list needs an explicit application-level filter contract.

## Contract

- Validate supported filter fields before the application query executes.
- Reject unknown fields without calling infrastructure.

## Allowed changes

- Only the allowed_paths metadata entries.

## Forbidden changes

- All forbidden_paths metadata entries.

## Acceptance criteria

- [x] Valid filters are accepted.
- [x] Unknown filter keys are rejected.

## Negative cases

- ORM input cannot pass through as the operation contract.

## Required checks

- Run every required_checks command.

## Stop conditions

- Stop when the base commit or scope is no longer valid.

## Expected handoff

- A structured handoff with command results and remaining risks.
