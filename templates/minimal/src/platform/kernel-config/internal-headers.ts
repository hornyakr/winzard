export const INTERNAL_PROXY_MARKER_HEADER = 'x-winzard-proxy';
export const INTERNAL_REQUEST_ID_HEADER = 'x-winzard-request-id';
export const INTERNAL_TENANT_HEADER = 'x-winzard-tenant-id';
export const INTERNAL_LOCALE_HEADER = 'x-winzard-locale';
export const INTERNAL_CLIENT_IP_HEADER = 'x-winzard-client-ip';
export const INTERNAL_ORIGIN_HEADER = 'x-winzard-origin';

export const INTERNAL_REQUEST_HEADERS = Object.freeze([
  INTERNAL_CLIENT_IP_HEADER,
  INTERNAL_LOCALE_HEADER,
  INTERNAL_ORIGIN_HEADER,
  INTERNAL_PROXY_MARKER_HEADER,
  INTERNAL_REQUEST_ID_HEADER,
  INTERNAL_TENANT_HEADER,
] as const);
