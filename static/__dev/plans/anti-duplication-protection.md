---
created: 2026-04-17T15:32:33.507Z
updated: 2026-04-17T15:54:08.479Z
---

# Anti-Duplication Platform Protection

## Summary
Implement comprehensive anti-duplication measures to prevent nefarious actors from cloning or replicating the Credit Regulator Pro platform. This includes domain locking, PDF watermarking, hardened rate limiting, request fingerprinting, and hidden content markers.

## Files to Create

### `helpers/domainGuard`
- **Purpose**: Centralized origin/referer validation middleware
- Maintains an allowlist of authorized domains: `creditregulatorpro.com`, `www.creditregulatorpro.com`, `xapp.floot.app`, `xapp.compnd.systems`, and the sandbox domain
- Exports a `validateOrigin(request: Request)` function that checks Origin and Referer headers
- Returns `{ valid: boolean, origin: string }` — if invalid, endpoints can reject the request
- Allows server-to-server calls (no origin header) for cron/webhook endpoints that use their own auth
- Allows requests with no origin/referer only if they have a valid session cookie (prevents curl abuse while allowing normal browser navigation)
- Checks `DOMAIN_GUARD_MODE` from the `system_settings` table
- Supports two modes: `"log_only"` (logs violations but allows request) and `"enforce"` (blocks with 403)
- Defaults to `"log_only"` to allow monitoring before enforcement
- Logs all violations to `suspicious_activity_log` with reason `"ORIGIN_VIOLATION"` regardless of mode
- The mode can be toggled via the existing admin settings page

### `helpers/requestFingerprint`
- **Purpose**: Track and flag suspicious request patterns
- Generates a fingerprint from IP + User-Agent + accept headers
- Logs fingerprints to a `request_fingerprint` table with timestamps
- Exports `checkSuspiciousActivity(fingerprint: string, action: string)` that flags:
  - More than 50 unique endpoints hit in 5 minutes from same fingerprint
  - More than 200 total requests in 5 minutes from same fingerprint
  - Rapid sequential access patterns (scraping behavior)
- Returns `{ suspicious: boolean, reason?: string }`
- Uses the existing `rateLimitEntry` pattern for cleanup

### `helpers/contentMarker`
- **Purpose**: Embed invisible fingerprints in generated content
- Exports `embedMarker(content: string, userId: string, timestamp: Date)` — inserts zero-width Unicode characters encoding a hash of userId + timestamp into text content
- Exports `extractMarker(content: string)` — decodes the zero-width characters to recover the original hash
- Exports `generatePdfWatermark(userId: string, packetId: string)` — returns pdfmake content objects for:
  - A nearly invisible (very light gray, tiny font) diagonal watermark with encoded user/packet info
  - Hidden metadata in the PDF document info (author, creator, keywords fields with encoded platform identifier)
  - Micro-text in margins with encoded origin hash

## Anti-Copy Protection
Apply these measures to all sensitive/proprietary content (dispute letters, packets, knowledge base, compliance scan results, violation details). **Note: All anti-copy protections (text selection, right-click, copy interception) should be bypassed entirely for users with `admin` or `support` roles. The `ProtectedContent` wrapper component should check the user's role via `useAuth` and render children without protections for these roles.**

1. **Disable Text Selection** — CSS `user-select: none` on sensitive content areas. Create a reusable wrapper component `ProtectedContent` that applies this. **Ensure the CSS includes an override for form inputs: `input, textarea, select, [contenteditable] { user-select: text !important; }` so that forms remain usable.**

2. **Disable Right-Click** — `onContextMenu` prevention on protected content areas, handled by the same `ProtectedContent` wrapper component. **This should only apply on non-touch/desktop devices. On mobile/touch devices, native long-press gestures must be preserved for accessibility (text-to-speech, share, etc.). Use a media query or touch detection to conditionally apply this.**

3. **Print Protection** — CSS `@media print` rules that hide or redact sensitive content. Show a message like "This content is protected. Please use the official PDF download." when printing. Note: Print protection should ONLY apply to proprietary platform content (knowledge base articles, compliance scan results, violation details, and the compliance audit viewer). It should NOT apply to user-owned content (dispute letters, packets, packet previews, or any content the user generated and needs to print/mail).

4. **Copy Event Interception** — JavaScript `copy` event listener that, if someone bypasses selection block, replaces clipboard content with an attribution notice: "This content is proprietary to Credit Regulator Pro. Unauthorized reproduction is prohibited. [User ID: xxx]". **This should ONLY apply to proprietary platform content (knowledge base, compliance scan logic, violation detection rules). It should NOT apply to user-owned data (tradeline details, account numbers, creditor names, balances, packet content). The `ProtectedContent` component should accept an `allowCopy` prop (default `false`) similar to `allowPrint`.**

The `ProtectedContent` wrapper component should wrap sensitive areas in: knowledge base pages, packet viewer, compliance audit viewer, dispute letter preview, compliance scan results, violation details. It should accept an `allowPrint` prop (default `false`) and an `allowCopy` prop (default `false`) so components wrapping user-owned documents can opt out of print/copy blocking while still keeping text selection active where appropriate.

## Files to Modify

### `helpers/endpointErrorHandler`
- Add a new `OriginNotAllowedError` class (HTTP 403)
- Handle it in `handleEndpointError` with a generic "Access denied" message (don't reveal why)

### `helpers/rateLimiter`
- Add stricter rate limit configs:
  - `SCRAPING_DETECTION`: 200 requests per 5 minutes per fingerprint
  - `ENDPOINT_BREADTH`: 50 unique endpoints per 5 minutes
  - `ANONYMOUS_UPLOAD`: 5 per 22 minutes (down from 10)
  - `REPORT_PARSE`: 5 per 60 minutes
- Add a `GLOBAL` config: 500 requests per 15 minutes per IP

### `helpers/pdfGenerator`
- Import `generatePdfWatermark` from `contentMarker`
- For all LetterContent PDFs, automatically embed:
  - Near-invisible diagonal watermark text
  - PDF metadata (author: "Credit Regulator Pro", creator with encoded hash, keywords with platform fingerprint)
  - A tiny "Generated by Credit Regulator Pro — Ref: [encoded-hash]" in the footer margin
- Accept optional `userId` and `packetId` parameters for watermark encoding

### Multiple endpoint files (high-value endpoints)
Add domain guard validation to these critical endpoints:
- `ingest/report_POST` — report upload (core IP)
- `ingest/anonymous-report_POST` — anonymous upload. **Must also be updated to replace its hardcoded rate limit (`checkRateLimit(ip, "ANON_UPLOAD", 3, 60)`) with the new `RateLimitConfig.ANONYMOUS_UPLOAD` (5 per 22 minutes) so the new stricter limit applies.**
- `packet/build_POST` — packet generation (core IP)
- `packet/create_POST` — packet creation
- `packet/pdf_GET` — PDF download
- `packet/send-registered_POST` — mail sending
- `packet/send-first-class_POST` — mail sending
- `tradeline/rescan-compliance_POST` — compliance scanning
- `scanning-rule/generate_POST` — rule generation
- `scanning-rule/generate-all_POST` — bulk rule generation
- `auth/register_with_password_POST` — registration
- `auth/login_with_password_POST` — login
- `subscription/create-checkout_POST` — payments

**OAuth Exemption**: `auth/oauth_callback_GET` and `auth/oauth_authorize_GET` must be EXEMPT from domain guard checks entirely. OAuth callbacks come from external OAuth providers (Google, Floot) with non-matching Origin headers — blocking them would break all OAuth logins.

Pattern: At the top of each endpoint's handle function, call `validateOrigin(request)`. If invalid, return 403 via `OriginNotAllowedError`.

### `helpers/packetLetterBuilder` (and related packet template helpers)
- Pass userId and packetId through to `generatePDF` calls so watermarks are properly encoded

## Database Changes

### New table: `request_fingerprint`
```sql
CREATE TABLE request_fingerprint (
  id TEXT PRIMARY KEY DEFAULT nanoid(),
  fingerprint_hash TEXT NOT NULL,
  action TEXT NOT NULL,
  endpoint_path TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_request_fingerprint_hash_created 
  ON request_fingerprint(fingerprint_hash, created_at);
```

### New table: `suspicious_activity_log`
```sql
CREATE TABLE suspicious_activity_log (
  id TEXT PRIMARY KEY DEFAULT nanoid(),
  fingerprint_hash TEXT NOT NULL,
  reason TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  blocked BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suspicious_activity_created 
  ON suspicious_activity_log(created_at);
```

## Approach

### Step 1: Database Setup
Create the `request_fingerprint` and `suspicious_activity_log` tables.

### Step 2: Create Core Helpers
1. Create `domainGuard` — origin validation logic
2. Create `requestFingerprint` — fingerprinting and suspicious activity detection
3. Create `contentMarker` — invisible content markers and PDF watermarks

### Step 3: Update Error Handler
Add `OriginNotAllowedError` to `endpointErrorHandler`.

### Step 4: Harden Rate Limiter
Add new stricter rate limit configurations.

### Step 5: Update PDF Generator
Integrate watermarking into `pdfGenerator` so every generated PDF carries hidden platform fingerprints.

### Step 6: Wire Domain Guard into Endpoints
Add origin validation to all high-value endpoints listed above. Use a consistent pattern at the top of each handler.

### Step 7: Wire Request Fingerprinting
Add fingerprint tracking to the most sensitive endpoints (report ingestion, packet building, compliance scanning).

### Step 8: Update Packet Pipeline
Pass userId/packetId through the packet building chain so watermarks carry proper attribution.

## Risks & Considerations

- **Sandbox compatibility**: The domain guard must allow the sandbox domain and requests without Origin headers from server-side cron/webhooks. The sandbox domain is already known.
- **False positives**: Domain validation must handle edge cases like mobile app WebViews, preflight CORS, and the Floot preview iframe. The mobile app uses the published domain so it should be fine.
- **Performance**: Request fingerprinting writes to the DB on every tracked request. Use lightweight inserts and periodic cleanup (same pattern as rate limiter). Only track high-value endpoints, not every request.
- **Backward compatibility**: All changes are additive — no endpoint signatures change, no breaking changes to existing API contracts. The PDF watermarks are nearly invisible and don't affect document usability.
- **Webhook endpoints**: Cron and webhook endpoints (clock/scan, webhook/postgrid, webhook/tracking, etc.) use their own auth tokens and should bypass domain guard since they're server-to-server.
- **Content markers**: Zero-width characters could potentially be stripped by some text processors, so they serve as a secondary detection method, not a primary one. The PDF watermarks are more resilient.
- **OAuth Exemption**: OAuth endpoints must never be domain-guarded since callbacks originate from external OAuth providers.
- **PDF GET safety**: PDF GET endpoint is confirmed safe: `fetch()` always sends Origin, and the "no origin + valid session" fallback handles direct navigation/bookmarks.
- **Fingerprint DB Cleanup**: The `request_fingerprint` table needs a periodic cleanup job that deletes entries older than 24 hours, following the same pattern as the rate limiter cleanup to prevent database bloat.