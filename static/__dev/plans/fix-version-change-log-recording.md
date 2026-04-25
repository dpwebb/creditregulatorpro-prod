---
created: 2026-04-16T13:05:54.089Z
updated: 2026-04-16T13:05:54.089Z
---

---
created: 2026-04-16
---

# Fix Version System Change Log Recording

## Summary
The version system's change summary is nearly empty because the vast majority of CRUD endpoints never call the `auditLogger` to record operations to `audit_log`. The change-summary endpoint queries `audit_log` for weighted action types, but only ~10 of 50+ endpoints log anything. This means version bumps are underweighted, change notes are incomplete, and the admin version management page shows a misleading picture.

## Root Cause
Most CRUD endpoints were built without `logAudit`/`logCreate`/`logUpdate`/`logDelete` calls. Only a handful of endpoints (obligation/create, fraud-freeze/create, deadline CRUD, review/*, admin/retention, admin/reset-user, tradeline/delete, admin/delete-user, ocr/extract) call the audit logger.

## Files to Modify

### Batch 1: CREATE endpoints (action: CREATE)
Each needs `import { logCreate } from "../../helpers/auditLogger"` and a `logCreate(user.id, entityType, entityId, details, request)` call after successful DB insert.

1. **`endpoints/packet/create_POST.ts`** — entityType: PACKET
2. **`endpoints/tradeline/create_POST.ts`** — entityType: TRADELINE
3. **`endpoints/evidence/create_POST.ts`** — entityType: EVIDENCE_EVENT
4. **`endpoints/bankruptcy/create_POST.ts`** — entityType: TRADELINE (bankruptcy record)
5. **`endpoints/statute/create_POST.ts`** — entityType: STATUTE
6. **`endpoints/bureau/create_POST.ts`** — entityType: BUREAU
7. **`endpoints/regulatory-update/create_POST.ts`** — entityType: REGULATORY_UPDATE
8. **`endpoints/discrimination/create_POST.ts`** — entityType: TRADELINE
9. **`endpoints/enforcement-mechanism/create_POST.ts`** — entityType: ENFORCEMENT_MECHANISM
10. **`endpoints/feature-flag/create_POST.ts`** — entityType: SYSTEM
11. **`endpoints/creditor-validation/create_POST.ts`** — entityType: FURNISHER_VALIDATION
12. **`endpoints/support-ticket/create_POST.ts`** — entityType: SYSTEM
13. **`endpoints/parser-known-entity/create_POST.ts`** — entityType: SYSTEM

### Batch 2: UPDATE endpoints (action: UPDATE)
Each needs `import { logUpdate } from "../../helpers/auditLogger"` and a `logUpdate(user.id, entityType, entityId, { before, after }, request)` call. For simplicity, the `before` can be omitted or just include the fields that changed.

14. **`endpoints/obligation/update_POST.ts`** — entityType: OBLIGATION
15. **`endpoints/evidence/update_POST.ts`** — entityType: EVIDENCE_EVENT
16. **`endpoints/bankruptcy/update_POST.ts`** — entityType: TRADELINE
17. **`endpoints/statute/update_POST.ts`** — entityType: STATUTE
18. **`endpoints/scanning-rule/update_POST.ts`** — entityType: SYSTEM
19. **`endpoints/feature-flag/update_POST.ts`** — entityType: SYSTEM
20. **`endpoints/discrimination/update_POST.ts`** — entityType: TRADELINE
21. **`endpoints/enforcement-mechanism/update_POST.ts`** — entityType: ENFORCEMENT_MECHANISM
22. **`endpoints/creditor-validation/update_POST.ts`** — entityType: FURNISHER_VALIDATION
23. **`endpoints/regulatory-update/update_POST.ts`** — entityType: REGULATORY_UPDATE
24. **`endpoints/admin/settings_POST.ts`** — entityType: SYSTEM, action: SETTINGS_CHANGED
25. **`endpoints/admin/compliance-config_POST.ts`** — entityType: SYSTEM, action: CONFIG_UPDATE
26. **`endpoints/packet/update-status_POST.ts`** — entityType: PACKET

### Batch 3: DELETE endpoints (action: DELETE)
Each needs `import { logDelete } from "../../helpers/auditLogger"` and a `logDelete(user.id, entityType, entityId, request)` call.

27. **`endpoints/obligation/delete_POST.ts`** — entityType: OBLIGATION
28. **`endpoints/evidence/delete_POST.ts`** — entityType: EVIDENCE_EVENT
29. **`endpoints/bankruptcy/delete_POST.ts`** — entityType: TRADELINE
30. **`endpoints/statute/delete_POST.ts`** — entityType: STATUTE
31. **`endpoints/bureau/delete_POST.ts`** — entityType: BUREAU
32. **`endpoints/scanning-rule/delete_POST.ts`** — entityType: SYSTEM
33. **`endpoints/feature-flag/delete_POST.ts`** — entityType: SYSTEM
34. **`endpoints/discrimination/delete_POST.ts`** — entityType: TRADELINE
35. **`endpoints/enforcement-mechanism/delete_POST.ts`** — entityType: ENFORCEMENT_MECHANISM
36. **`endpoints/creditor-validation/delete_POST.ts`** — entityType: FURNISHER_VALIDATION
37. **`endpoints/regulatory-update/delete_POST.ts`** — entityType: REGULATORY_UPDATE
38. **`endpoints/packet/delete_POST.ts`** — entityType: PACKET

### Batch 4: Special action type endpoints
39. **`endpoints/packet/build_POST.ts`** — action: PACKET_GENERATED, entityType: PACKET (use `logPacketGenerated`)
40. **`endpoints/support-ticket/update_POST.ts`** — action: UPDATE, entityType: SYSTEM
41. **`endpoints/support-ticket/reply_POST.ts`** — action: UPDATE, entityType: SYSTEM

## Files to Create
None.

## Approach
1. Work through each batch, adding the appropriate audit logger import and call to each endpoint.
2. Place the `logAudit` call after the successful DB operation but before the response is returned.
3. Use `await` but do NOT let audit log failures break the main operation — the auditLogger already handles this gracefully with try/catch.
4. For UPDATE endpoints, log a simplified `{ before: {}, after: { ...changedFields } }` details object. Full before/after snapshots are not required.
5. For admin settings/config changes, use the more specific action types (SETTINGS_CHANGED, CONFIG_UPDATE) instead of generic UPDATE.

## Risks & Considerations
- Audit logging is fire-and-forget with graceful error handling, so adding these calls will not break any existing functionality.
- The `await` adds a small latency per request (one DB insert), but audit_log inserts are lightweight.
- Entity types must match the `AuditEntityType` enum in the schema. Some endpoints may need to use the closest matching type (e.g., bankruptcy uses TRADELINE since there's no BANKRUPTCY entity type).
- This is a backend-only change — no frontend modifications needed.
- After deployment, all new operations will be tracked, and the version system's change summary will accurately reflect platform activity.
