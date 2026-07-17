import { renderMarkdownDocument } from './frontmatter';
import type { FrontmatterRecord } from './types';

export type SupportedDocumentTemplate =
  | 'capability'
  | 'adr'
  | 'specification'
  | 'policy'
  | 'task'
  | 'handoff'
  | 'review'
  | 'evidence'
  | 'runbook'
  | 'release'
  | 'incident';

export type DocumentationScaffoldFile = Readonly<{
  path: string;
  content: string;
  generated: boolean;
}>;

type TemplateDefinition = Readonly<{
  token: string;
  digits: 3 | 4;
  directory: string;
  kind: string;
  subtype: string;
  authority: string;
  body: (title: string) => string;
}>;

const templateDefinitions: Readonly<Record<SupportedDocumentTemplate, TemplateDefinition>> = {
  capability: {
    token: 'CAP',
    digits: 3,
    directory: 'docs/10-product/capabilities',
    kind: 'product',
    subtype: 'capability',
    authority: 'normative',
    body: (title) => `# ${title}\n\n## Summary\n\nDescribe the user or business capability.\n\n## Contract\n\n- Define the observable outcome.\n\n## Scope\n\n### In scope\n\n- TODO\n\n### Out of scope\n\n- TODO\n\n## Acceptance criteria\n\n- [ ] The capability has an observable result.\n\n## Related documents\n\n- TODO\n`,
  },
  adr: {
    token: 'ADR',
    digits: 4,
    directory: 'docs/30-architecture/adr',
    kind: 'decision',
    subtype: 'adr',
    authority: 'normative',
    body: (title) => `# ${title}\n\n## Summary\n\nDecision summary.\n\n## Context\n\nDescribe the forces and constraints.\n\n## Contract\n\nState the accepted decision as precise rules.\n\n## Alternatives\n\n- TODO\n\n## Consequences\n\n### Positive\n\n- TODO\n\n### Negative\n\n- TODO\n\n## Acceptance criteria\n\n- [ ] The decision is reflected by the implementation and checks.\n`,
  },
  specification: {
    token: 'SPEC',
    digits: 3,
    directory: 'docs/30-architecture/specifications',
    kind: 'contract',
    subtype: 'specification',
    authority: 'normative',
    body: (title) => `# ${title}\n\n## Summary\n\nContract summary.\n\n## Contract\n\nDefine inputs, outputs, invariants and failure behaviour.\n\n## Scope\n\n- TODO\n\n## Constraints and prohibitions\n\n- TODO\n\n## Correct examples\n\n- TODO\n\n## Incorrect examples\n\n- TODO\n\n## Security requirements\n\n- TODO\n\n## Acceptance criteria\n\n- [ ] Positive and negative cases are testable.\n\n## Evidence\n\n- None yet.\n`,
  },
  policy: {
    token: 'POLICY',
    digits: 3,
    directory: 'docs/70-ai/policies',
    kind: 'contract',
    subtype: 'policy',
    authority: 'normative',
    body: (title) => `# ${title}\n\n## Summary\n\nPolicy summary.\n\n## Contract\n\n- State mandatory and prohibited behaviour.\n\n## Constraints and prohibitions\n\n- TODO\n\n## Security requirements\n\n- TODO\n\n## Acceptance criteria\n\n- [ ] The policy can be validated or enforced.\n`,
  },
  task: {
    token: 'TASK',
    digits: 4,
    directory: 'docs/40-delivery/tasks',
    kind: 'delivery',
    subtype: 'task-brief',
    authority: 'normative',
    body: (title) => `# ${title}\n\n## Outcome\n\nDescribe the exact result.\n\n## Non-goals\n\n- TODO\n\n## Context\n\n- TODO\n\n## Contract\n\n- TODO\n\n## Allowed changes\n\n- Only the allowed_paths metadata entries.\n\n## Forbidden changes\n\n- All forbidden_paths metadata entries.\n\n## Acceptance criteria\n\n- [ ] TODO\n\n## Negative cases\n\n- TODO\n\n## Required checks\n\n- Run every required_checks command.\n\n## Stop conditions\n\n- Stop when the base commit or scope is no longer valid.\n\n## Expected handoff\n\n- A structured handoff with command results and remaining risks.\n`,
  },
  handoff: {
    token: 'HANDOFF',
    digits: 4,
    directory: 'docs/40-delivery/handoffs',
    kind: 'delivery',
    subtype: 'handoff',
    authority: 'evidence',
    body: (title) => `# ${title}\n\n## Result\n\n- TODO\n\n## Modified paths\n\n- TODO\n\n## Implemented contract\n\n- TODO\n\n## Executed checks\n\n- TODO\n\n## Checks not executed\n\n- None.\n\n## Open risks\n\n- TODO\n\n## Operational impact\n\n- Migration: none\n- Environment: none\n- Cache: none\n- Deployment: none\n\n## Documentation impact\n\n- TODO\n\n## Next step\n\n- Independent review.\n`,
  },
  review: {
    token: 'REVIEW',
    digits: 4,
    directory: 'docs/40-delivery/reviews',
    kind: 'delivery',
    subtype: 'review',
    authority: 'evidence',
    body: (title) => `# ${title}\n\n## Scope reviewed\n\n- TODO\n\n## Contract comparison\n\n- TODO\n\n## Checks verified\n\n- TODO\n\n## Findings\n\n- TODO\n\n## Decision\n\n- changes_requested\n`,
  },
  evidence: {
    token: 'EVIDENCE',
    digits: 4,
    directory: 'docs/40-delivery/evidence',
    kind: 'evidence',
    subtype: 'test-result',
    authority: 'evidence',
    body: (title) => `# ${title}\n\n## Evidence summary\n\n- TODO\n\n## Command or measurement\n\n\`\`\`text\nTODO\n\`\`\`\n\n## Result\n\n- Exit code: TODO\n- Commit: TODO\n- Artifact: TODO\n\n## Redaction\n\n- No secret or personal data is included.\n`,
  },
  runbook: {
    token: 'RUN',
    digits: 3,
    directory: 'docs/60-operations/runbooks',
    kind: 'operation',
    subtype: 'runbook',
    authority: 'normative',
    body: (title) => `# ${title}\n\n## Summary\n\nOperational purpose.\n\n## Contract\n\nDefine preconditions and safe execution boundaries.\n\n## Procedure\n\n1. TODO\n\n## Rollback\n\n1. TODO\n\n## Security requirements\n\n- TODO\n\n## Acceptance criteria\n\n- [ ] The procedure and rollback were tested.\n`,
  },
  release: {
    token: 'REL',
    digits: 3,
    directory: 'docs/60-operations/releases',
    kind: 'operation',
    subtype: 'release',
    authority: 'evidence',
    body: (title) => `# ${title}\n\n## Scope\n\n- TODO\n\n## Included capabilities\n\n- TODO\n\n## Evidence\n\n- TODO\n\n## Migration\n\n- not_applicable\n\n## Rollback\n\n- TODO\n`,
  },
  incident: {
    token: 'INC',
    digits: 3,
    directory: 'docs/60-operations/incidents',
    kind: 'operation',
    subtype: 'incident',
    authority: 'evidence',
    body: (title) => `# ${title}\n\n## Summary\n\n- TODO\n\n## Impact\n\n- TODO\n\n## Timeline\n\n- TODO\n\n## Root cause\n\n- TODO\n\n## Resolution\n\n- TODO\n\n## Follow-up\n\n- TODO\n`,
  },
};

export function templateDefinition(type: SupportedDocumentTemplate): TemplateDefinition {
  return templateDefinitions[type];
}

function baseMetadata(
  id: string,
  title: string,
  kind: string,
  subtype: string,
  authority: string,
  date: string,
  overrides: FrontmatterRecord = {},
): FrontmatterRecord {
  return {
    schema_version: 1,
    id,
    title,
    aliases: [],
    scope: 'generated-project',
    kind,
    subtype,
    authority,
    document_status: 'proposed',
    implementation_status: 'not_applicable',
    verification_status: 'not_applicable',
    owner: 'role:project-owner',
    approvers: [],
    classification: 'internal',
    ai_access: 'allowed',
    context_priority: 'relevant',
    created: date,
    updated: date,
    last_verified: null,
    review_due: null,
    applies_to: [],
    depends_on: [],
    supersedes: [],
    superseded_by: [],
    evidence: [],
    tags: [],
    ...overrides,
  };
}

export function documentTemplate(
  type: SupportedDocumentTemplate,
  id: string,
  title: string,
  date: string,
  overrides: FrontmatterRecord = {},
): string {
  const definition = templateDefinition(type);
  const metadata = baseMetadata(id, title, definition.kind, definition.subtype, definition.authority, date, {
    implementation_status: definition.authority === 'normative' ? 'not_started' : 'not_applicable',
    verification_status: definition.authority === 'normative' ? 'unverified' : 'not_applicable',
    ...(type === 'task' ? {
      related_capabilities: [],
      related_decisions: [],
      related_specifications: [],
      base_commit: 'REPLACE_WITH_GIT_COMMIT',
      allowed_paths: [],
      forbidden_paths: [],
      required_checks: ['pnpm typecheck', 'pnpm test', 'pnpm forge check'],
      allowed_tools: ['filesystem.read', 'filesystem.write:allowed_paths', 'shell:required_checks'],
      denied_tools: ['secret.read', 'production.deploy', 'database.destructive'],
      allowed_context_documents: [],
      approval_refs: [],
      risk: 'medium',
      human_approval: 'before_merge',
    } : {}),
    ...overrides,
  });
  return renderMarkdownDocument(metadata, definition.body(title));
}

function initialFile(
  projectPrefix: string,
  suffix: string,
  path: string,
  title: string,
  kind: string,
  subtype: string,
  authority: string,
  date: string,
  body: string,
  overrides: FrontmatterRecord = {},
): DocumentationScaffoldFile {
  const id = `${projectPrefix}-${suffix}`;
  return {
    path: `${path}/${id}.md`,
    generated: false,
    content: renderMarkdownDocument(baseMetadata(id, title, kind, subtype, authority, date, overrides), body),
  };
}

export function documentationScaffold(
  projectPrefix: string,
  date: string,
  includeAiDelivery: boolean,
): readonly DocumentationScaffoldFile[] {
  const files: DocumentationScaffoldFile[] = [
    initialFile(
      projectPrefix,
      'HOME-001',
      'docs/00-home',
      'Project Home',
      'guidance',
      'reference',
      'informative',
      date,
      `# Project Home\n\n## Purpose\n\nThis repository is the canonical project documentation vault.\n\n## Documentation map\n\n- [Project brief](../10-product/${projectPrefix}-VISION-001.md)\n- [Domain glossary](../20-domain/glossary/${projectPrefix}-GLOSSARY-001.md)\n- [Architecture map](../30-architecture/${projectPrefix}-ARCH-001.md)\n- [Delivery map](../40-delivery/${projectPrefix}-DELIVERY-001.md)\n- [Installed Winzard contracts](../80-winzard/)\n`,
      { document_status: 'accepted' },
    ),
    initialFile(
      projectPrefix,
      'VISION-001',
      'docs/10-product',
      'Project Brief',
      'product',
      'vision',
      'normative',
      date,
      `# Project Brief\n\n## Summary\n\nDescribe the product and its users.\n\n## Contract\n\n- Define the product boundary.\n\n## Problem\n\n- TODO\n\n## Target users\n\n- TODO\n\n## Success criteria\n\n- TODO\n\n## Non-goals\n\n- TODO\n\n## Acceptance criteria\n\n- [ ] The product boundary and success criteria are explicit.\n`,
      { implementation_status: 'not_applicable', verification_status: 'unverified', context_priority: 'required' },
    ),
    initialFile(
      projectPrefix,
      'GLOSSARY-001',
      'docs/20-domain/glossary',
      'Domain Glossary',
      'contract',
      'data-contract',
      'normative',
      date,
      `# Domain Glossary\n\n## Summary\n\nCanonical business vocabulary.\n\n## Contract\n\n| Term | Definition | Owning context | Deprecated synonyms |\n| --- | --- | --- | --- |\n| TODO | TODO | TODO | — |\n\n## Acceptance criteria\n\n- [ ] Every business-significant term has one canonical definition.\n`,
      { implementation_status: 'partial', verification_status: 'unverified', context_priority: 'required' },
    ),
    initialFile(
      projectPrefix,
      'ARCH-001',
      'docs/30-architecture',
      'Architecture Map',
      'guidance',
      'explanation',
      'informative',
      date,
      `# Architecture Map\n\n## System context\n\n- TODO\n\n## Modules and bounded contexts\n\n- TODO\n\n## Integrations\n\n- TODO\n\n## Decisions\n\n- Add links to accepted ADRs.\n`,
      { context_priority: 'required' },
    ),
    initialFile(
      projectPrefix,
      'DELIVERY-001',
      'docs/40-delivery',
      'Delivery Map',
      'guidance',
      'reference',
      'informative',
      date,
      `# Delivery Map\n\n## Active chain\n\n\`\`\`text\ncapability → ADR → specification → task → handoff → review → evidence → release\n\`\`\`\n\n## Active initiatives\n\n- None yet.\n`,
      { document_status: 'accepted', context_priority: 'relevant' },
    ),
  ];

  if (includeAiDelivery) {
    files.push(initialFile(
      projectPrefix,
      'POLICY-AI-001',
      'docs/70-ai/policies',
      'AI-assisted Delivery Policy',
      'contract',
      'policy',
      'normative',
      date,
      `# AI-assisted Delivery Policy\n\n## Summary\n\nProject-level rules for human and AI-assisted changes.\n\n## Contract\n\n- AI execution requires an accepted task brief with a base commit, allowed paths and required checks.\n- AI-generated ADRs and specifications remain proposed until human approval.\n- Merge and release require an explicit integrator gate.\n- Context access and tool permission are separate controls.\n\n## Constraints and prohibitions\n\n- Do not include secrets, customer data or complete chat transcripts in documentation or context packages.\n- Do not modify generated adapters or consumer contracts manually.\n- Do not continue when a forbidden path or destructive operation becomes necessary.\n\n## Security requirements\n\n- Missing approval enforcement fails closed.\n- Restricted documents require explicit task-level access.\n- The implementer cannot verify its own handoff as final evidence.\n\n## Acceptance criteria\n\n- [ ] AI adapters are generated from accepted project contracts.\n- [ ] Context packages are deterministic and provenance-tracked.\n- [ ] Task, handoff and review remain separately attributable.\n`,
      {
        document_status: 'accepted',
        implementation_status: 'implemented',
        verification_status: 'not_applicable',
        approvers: ['role:project-owner'],
        applies_to: ['**'],
        context_priority: 'required',
        tags: ['ai', 'delivery', 'security'],
      },
    ));
  }

  for (const type of Object.keys(templateDefinitions) as SupportedDocumentTemplate[]) {
    const definition = templateDefinitions[type];
    files.push({
      path: `docs/_templates/${type}.md`,
      generated: false,
      content: `# ${type} template\n\nGenerated with:\n\n\`\`\`bash\npnpm forge docs:new ${type}\n\`\`\`\n\nTarget directory: \`${definition.directory}\`.\n`,
    });
  }

  return files;
}
