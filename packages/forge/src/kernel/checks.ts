import { buildKernelInventory } from './inventory';
import type { KernelInventoryOptions, KernelIssue } from './types';

export async function runKernelChecks(
  root = process.cwd(),
  options: KernelInventoryOptions = {},
): Promise<readonly KernelIssue[]> {
  return (await buildKernelInventory(root, options)).issues;
}

const REQUEST_CONTEXT_CODES = new Set([
  'KERNEL_APPLICATION_COOKIE_IMPORT',
  'KERNEL_APPLICATION_REQUEST_IMPORT',
  'KERNEL_APPLICATION_NEXT_IMPORT',
  'KERNEL_CROSS_REQUEST_CACHE',
  'KERNEL_MUTABLE_REQUEST_GLOBAL',
  'KERNEL_PROXY_INTERNAL_HEADER_SPOOFING',
  'KERNEL_PROXY_ONLY_AUTHORIZATION',
  'KERNEL_PROXY_REQUEST_ID_MISSING',
  'KERNEL_REQUEST_CONTEXT_LEAK',
  'KERNEL_REQUEST_CONTEXT_MISSING',
  'KERNEL_UNTRUSTED_FORWARDED_HEADER',
]);

const RESPONSE_POLICY_CODES = new Set([
  'KERNEL_RAW_DOMAIN_RESPONSE',
  'KERNEL_RAW_EXCEPTION_RESPONSE',
  'KERNEL_RESPONSE_POLICY_MISSING',
  'KERNEL_RESPONSE_MUTATION_AFTER_STREAM',
  'KERNEL_STREAM_BEFORE_AUTH',
  'KERNEL_MISSING_ABORT_CLEANUP',
  'KERNEL_UNMAPPED_EXCEPTION',
]);

const INSTRUMENTATION_CODES = new Set([
  'KERNEL_AFTER_ASSUMES_SUCCESS',
  'KERNEL_AFTER_DURABLE_SIDE_EFFECT',
  'KERNEL_HIGH_CARDINALITY_ROUTE_METRIC',
  'KERNEL_INSTRUMENTATION_ERROR_HOOK_MISSING',
  'KERNEL_INSTRUMENTATION_MISSING',
  'KERNEL_INSTRUMENTATION_REGISTER_MISSING',
  'KERNEL_INSTRUMENTATION_HEADER_VALUE_LEAK',
]);

export function requestContextIssues(issues: readonly KernelIssue[]): readonly KernelIssue[] {
  return issues.filter(({ code }) => REQUEST_CONTEXT_CODES.has(code));
}

export function responsePolicyIssues(issues: readonly KernelIssue[]): readonly KernelIssue[] {
  return issues.filter(({ code }) => RESPONSE_POLICY_CODES.has(code));
}

export function instrumentationIssues(issues: readonly KernelIssue[]): readonly KernelIssue[] {
  return issues.filter(({ code }) => INSTRUMENTATION_CODES.has(code));
}
