# Production At Scale Endpoint Auth Appendix

Generated from `tests/contracts/route-auth-classification.spec.ts` at commit `6fb3b063622fdaf236b97bb6aac0f9a999b5bd88`.

The contract suite passed for this audit and asserts that the classified endpoints exactly equal the endpoint files discovered under `endpoints/` and the handlers registered by `server.ts`. Unsafe/unclassified endpoints: none in the executable contract.

## Production-Safe Probe Evidence

Runtime production probes are limited to read-only `GET`/`HEAD` requests. The production-safe probe evidence command is:

```bash
pnpm run production-safe-probes:evidence
```

It writes `docs/production-scale/evidence/latest-production-safe-probes.md` and `docs/production-scale/evidence/latest-production-safe-probes.json`.

Cron-token, webhook, and retired public reset routes are POST-capable, so their missing/invalid token and reset expectations are verified as static route-contract evidence only. They are not executed against production by the evidence command.

Local/staging owner-denial proof uses synthetic owner A/B fixtures only:

```bash
pnpm run staging-owner-denial-smoke:evidence
```

It writes `docs/production-scale/evidence/latest-staging-owner-denial-smoke.md` and `docs/production-scale/evidence/latest-staging-owner-denial-smoke.json`. This proof is local/staging-only and is not production mutation proof.

## Public (23)

- `endpoints/admin/letter-template/delete_POST.ts`
- `endpoints/admin/letter-template/history_GET.ts`
- `endpoints/admin/letter-template/humanize_POST.ts`
- `endpoints/admin/letter-template/rollback_POST.ts`
- `endpoints/admin/letter-template/seed_POST.ts`
- `endpoints/admin/letter-template_POST.ts`
- `endpoints/admin/letter-templates_GET.ts`
- `endpoints/auth/establish_session_POST.ts`
- `endpoints/auth/login_with_password_POST.ts`
- `endpoints/auth/logout_POST.ts`
- `endpoints/auth/oauth_authorize_GET.ts`
- `endpoints/auth/oauth_callback_GET.ts`
- `endpoints/auth/register_with_password_POST.ts`
- `endpoints/auth/request_password_reset_POST.ts`
- `endpoints/auth/reset_password_POST.ts`
- `endpoints/auth/verify_email_POST.ts`
- `endpoints/escalation/auto-trigger_POST.ts`
- `endpoints/escalation/scan_POST.ts`
- `endpoints/escalation/trigger_POST.ts`
- `endpoints/ingest/anonymous-report_POST.ts`
- `endpoints/lead/reminder_POST.ts`
- `endpoints/pdf/platform-functions_GET.ts`
- `endpoints/planner/select_POST.ts`

## Session-Authenticated (133)

- `endpoints/ai-assist/consumer-finding-explanation_POST.ts`
- `endpoints/auth/request_verification_email_POST.ts`
- `endpoints/auth/session_GET.ts`
- `endpoints/bankruptcy/create_POST.ts`
- `endpoints/bankruptcy/delete_POST.ts`
- `endpoints/bankruptcy/list_GET.ts`
- `endpoints/bankruptcy/update_POST.ts`
- `endpoints/bureau/dispute-contacts_GET.ts`
- `endpoints/bureau/list_GET.ts`
- `endpoints/calendar/check-deadlines_POST.ts`
- `endpoints/cases/patch_POST.ts`
- `endpoints/cases/review-data_GET.ts`
- `endpoints/cases/review_GET.ts`
- `endpoints/consumer-signature/get_GET.ts`
- `endpoints/consumer-signature/list_GET.ts`
- `endpoints/creditor-validation/create_POST.ts`
- `endpoints/creditor-validation/delete_POST.ts`
- `endpoints/creditor-validation/dismiss_POST.ts`
- `endpoints/creditor-validation/list_GET.ts`
- `endpoints/creditor-validation/update_POST.ts`
- `endpoints/dashboard/stats_GET.ts`
- `endpoints/deadline/complete_POST.ts`
- `endpoints/deadline/create_POST.ts`
- `endpoints/deadline/delete_POST.ts`
- `endpoints/deadline/overdue_GET.ts`
- `endpoints/deadline/upcoming_GET.ts`
- `endpoints/deadline/update_POST.ts`
- `endpoints/discrimination/create_POST.ts`
- `endpoints/discrimination/delete_POST.ts`
- `endpoints/discrimination/list_GET.ts`
- `endpoints/discrimination/update_POST.ts`
- `endpoints/enforcement-mechanism/list_GET.ts`
- `endpoints/evidence-attachment/list_GET.ts`
- `endpoints/evidence-attachment/package_POST.ts`
- `endpoints/evidence-attachment/upload_POST.ts`
- `endpoints/evidence/bureau-communication_POST.ts`
- `endpoints/evidence/create_POST.ts`
- `endpoints/evidence/delete_POST.ts`
- `endpoints/evidence/list_GET.ts`
- `endpoints/evidence/update_POST.ts`
- `endpoints/feature-flag/list_GET.ts`
- `endpoints/fraud-freeze/cancel_POST.ts`
- `endpoints/fraud-freeze/create_POST.ts`
- `endpoints/fraud-freeze/list_GET.ts`
- `endpoints/fraud-freeze/request-thaw_POST.ts`
- `endpoints/fraud-freeze/update_POST.ts`
- `endpoints/hidden-risk/list_GET.ts`
- `endpoints/ingest/process_POST.ts`
- `endpoints/ingest/report_POST.ts`
- `endpoints/legal-authority/search_GET.ts`
- `endpoints/licensed-agency/ai-verify_POST.ts`
- `endpoints/licensed-agency/check_GET.ts`
- `endpoints/metro2-validation-log/list_GET.ts`
- `endpoints/obligation-instance/list_GET.ts`
- `endpoints/obligation-instance/record-response_POST.ts`
- `endpoints/obligation/list_GET.ts`
- `endpoints/ocr/extract_POST.ts`
- `endpoints/outcomes/compare_POST.ts`
- `endpoints/outcomes/get_GET.ts`
- `endpoints/outcomes/list_GET.ts`
- `endpoints/packet/build_POST.ts`
- `endpoints/packet/compliance-audit_GET.ts`
- `endpoints/packet/compliance-calendar_GET.ts`
- `endpoints/packet/create_POST.ts`
- `endpoints/packet/delete_POST.ts`
- `endpoints/packet/delivery_POST.ts`
- `endpoints/packet/get_GET.ts`
- `endpoints/packet/impact_GET.ts`
- `endpoints/packet/list_GET.ts`
- `endpoints/packet/pdf_GET.ts`
- `endpoints/packet/recommend_GET.ts`
- `endpoints/packet/save_POST.ts`
- `endpoints/packet/send-first-class_POST.ts`
- `endpoints/packet/send-registered_POST.ts`
- `endpoints/packet/update-status_POST.ts`
- `endpoints/packet/validate-readiness_POST.ts`
- `endpoints/pdf/analytics-report_POST.ts`
- `endpoints/pdf/knowledge-base_GET.ts`
- `endpoints/pdf/report_POST.ts`
- `endpoints/postal/transactions_GET.ts`
- `endpoints/regulatory-notification/dismiss-all_POST.ts`
- `endpoints/regulatory-notification/mark-read_POST.ts`
- `endpoints/regulatory-update/list_GET.ts`
- `endpoints/report-artifact/create_POST.ts`
- `endpoints/report-artifact/delete_POST.ts`
- `endpoints/report-artifact/get_GET.ts`
- `endpoints/report-artifact/list_GET.ts`
- `endpoints/report-artifact/update_POST.ts`
- `endpoints/responses/capture_POST.ts`
- `endpoints/responses/get_GET.ts`
- `endpoints/responses/list_GET.ts`
- `endpoints/responses/metrics_GET.ts`
- `endpoints/review/approve_POST.ts`
- `endpoints/review/reject_POST.ts`
- `endpoints/statute/filter-options_GET.ts`
- `endpoints/statute/history_GET.ts`
- `endpoints/statute/list_GET.ts`
- `endpoints/stripe/create-payment-intent_POST.ts`
- `endpoints/subscription/cancel_POST.ts`
- `endpoints/subscription/confirm-payment_POST.ts`
- `endpoints/subscription/create-checkout_POST.ts`
- `endpoints/subscription/status_GET.ts`
- `endpoints/subscription/update-plan_POST.ts`
- `endpoints/success/analytics_GET.ts`
- `endpoints/support-ticket/agents_GET.ts`
- `endpoints/support-ticket/create_POST.ts`
- `endpoints/support-ticket/get_GET.ts`
- `endpoints/support-ticket/list_GET.ts`
- `endpoints/support-ticket/reply_POST.ts`
- `endpoints/support-ticket/update_POST.ts`
- `endpoints/support/ai-chat_POST.ts`
- `endpoints/tradeline/change-timeline_GET.ts`
- `endpoints/tradeline/create_POST.ts`
- `endpoints/tradeline/delete_POST.ts`
- `endpoints/tradeline/detect-changes_POST.ts`
- `endpoints/tradeline/drift-logs_GET.ts`
- `endpoints/tradeline/gap-fill_POST.ts`
- `endpoints/tradeline/get_GET.ts`
- `endpoints/tradeline/list_GET.ts`
- `endpoints/tradeline/rescan-compliance_POST.ts`
- `endpoints/tradeline/rotation-history_GET.ts`
- `endpoints/upload-results/get_GET.ts`
- `endpoints/user/accept-terms_POST.ts`
- `endpoints/user/data-summary_GET.ts`
- `endpoints/user/delete-account_POST.ts`
- `endpoints/user/delete-data_POST.ts`
- `endpoints/user/identification/delete_POST.ts`
- `endpoints/user/identification/file_GET.ts`
- `endpoints/user/identification_GET.ts`
- `endpoints/user/identification_POST.ts`
- `endpoints/user/profile_GET.ts`
- `endpoints/user/profile_POST.ts`
- `endpoints/version/current_GET.ts`

## Admin-Only (123)

- `endpoints/admin/ai-assist/findings_GET.ts`
- `endpoints/admin/ai-assist/runs_GET.ts`
- `endpoints/admin/audit-logs_GET.ts`
- `endpoints/admin/backfill-compliance_POST.ts`
- `endpoints/admin/cleanup-stale-auth_POST.ts`
- `endpoints/admin/compliance-config_GET.ts`
- `endpoints/admin/compliance-config_POST.ts`
- `endpoints/admin/create-support-agent_POST.ts`
- `endpoints/admin/delete-user_POST.ts`
- `endpoints/admin/diagnostic/semantic-audit_POST.ts`
- `endpoints/admin/ingest-queue-remediation_POST.ts`
- `endpoints/admin/ingest-queue_GET.ts`
- `endpoints/admin/mock-lifecycle/list_GET.ts`
- `endpoints/admin/mock-lifecycle/report_GET.ts`
- `endpoints/admin/mock-lifecycle/run_POST.ts`
- `endpoints/admin/mock-lifecycle/status_GET.ts`
- `endpoints/admin/postal-revenue_GET.ts`
- `endpoints/admin/purge_POST.ts`
- `endpoints/admin/reset-user_POST.ts`
- `endpoints/admin/retention/stats_GET.ts`
- `endpoints/admin/retention_POST.ts`
- `endpoints/admin/seed_POST.ts`
- `endpoints/admin/settings_GET.ts`
- `endpoints/admin/settings_POST.ts`
- `endpoints/admin/user-detail_GET.ts`
- `endpoints/admin/users_GET.ts`
- `endpoints/admin/violation-correction/create_POST.ts`
- `endpoints/admin/violation-correction/detail_GET.ts`
- `endpoints/admin/violation-correction/evidence_POST.ts`
- `endpoints/admin/violation-correction/export_POST.ts`
- `endpoints/admin/violation-correction/finalize_POST.ts`
- `endpoints/admin/violation-correction/regulation-reference_POST.ts`
- `endpoints/admin/violation-correction/runs_GET.ts`
- `endpoints/admin/violation-correction/update_POST.ts`
- `endpoints/audit/log_GET.ts`
- `endpoints/bureau-detection-config/list_GET.ts`
- `endpoints/bureau-detection-config/update_POST.ts`
- `endpoints/bureau-detection-config/upsert_POST.ts`
- `endpoints/bureau/create_POST.ts`
- `endpoints/bureau/delete_POST.ts`
- `endpoints/enforcement-mechanism/create_POST.ts`
- `endpoints/enforcement-mechanism/delete_POST.ts`
- `endpoints/enforcement-mechanism/update_POST.ts`
- `endpoints/feature-flag/create_POST.ts`
- `endpoints/feature-flag/delete_POST.ts`
- `endpoints/feature-flag/update_POST.ts`
- `endpoints/lead/send-reminders_POST.ts`
- `endpoints/licensed-agency/import_POST.ts`
- `endpoints/licensed-agency/list_GET.ts`
- `endpoints/migration/create_POST.ts`
- `endpoints/migration/list_GET.ts`
- `endpoints/migration/update_POST.ts`
- `endpoints/obligation/create_POST.ts`
- `endpoints/obligation/delete_POST.ts`
- `endpoints/obligation/update_POST.ts`
- `endpoints/outcomes/admin-review_POST.ts`
- `endpoints/parser-known-entity/create_POST.ts`
- `endpoints/parser-known-entity/list_GET.ts`
- `endpoints/parser-lab/run_POST.ts`
- `endpoints/parser-mapping/create_POST.ts`
- `endpoints/parser-mapping/delete_POST.ts`
- `endpoints/parser-mapping/history_GET.ts`
- `endpoints/parser-mapping/list_GET.ts`
- `endpoints/parser-mapping/rollback_POST.ts`
- `endpoints/parser-mapping/test_POST.ts`
- `endpoints/parser-mapping/update_POST.ts`
- `endpoints/parser-test-case/adjudicate_POST.ts`
- `endpoints/parser-test-case/create_POST.ts`
- `endpoints/parser-test-case/delete_POST.ts`
- `endpoints/parser-test-case/export_POST.ts`
- `endpoints/parser-test-case/get_GET.ts`
- `endpoints/parser-test-case/import_POST.ts`
- `endpoints/parser-test-case/list_GET.ts`
- `endpoints/parser-test-case/promote-rule_POST.ts`
- `endpoints/parser-test-case/run-all_POST.ts`
- `endpoints/parser-test-case/run_POST.ts`
- `endpoints/parser-test-case/update_POST.ts`
- `endpoints/pdf/admin-knowledge-base_GET.ts`
- `endpoints/regulation-registry/advisory-bridge/report_GET.ts`
- `endpoints/regulation-registry/candidates_GET.ts`
- `endpoints/regulation-registry/create-candidate_POST.ts`
- `endpoints/regulation-registry/deactivate_POST.ts`
- `endpoints/regulation-registry/list_GET.ts`
- `endpoints/regulation-registry/mapping_GET.ts`
- `endpoints/regulation-registry/mapping_POST.ts`
- `endpoints/regulation-registry/rebuild-index_POST.ts`
- `endpoints/regulation-registry/reconciliation-candidates/create_POST.ts`
- `endpoints/regulation-registry/reconciliation-candidates/list_GET.ts`
- `endpoints/regulation-registry/reconciliation-candidates/update-status_POST.ts`
- `endpoints/regulation-registry/restore_POST.ts`
- `endpoints/regulation-registry/review_POST.ts`
- `endpoints/regulation-registry/runtime-bridge/create_POST.ts`
- `endpoints/regulation-registry/runtime-bridge/list_GET.ts`
- `endpoints/regulation-registry/runtime-bridge/update-status_POST.ts`
- `endpoints/regulation-registry/scan_POST.ts`
- `endpoints/regulation-registry/shadow-bridge/report_GET.ts`
- `endpoints/regulatory-notification/list_GET.ts`
- `endpoints/regulatory-update/auto-escalate_POST.ts`
- `endpoints/regulatory-update/create_POST.ts`
- `endpoints/regulatory-update/delete_POST.ts`
- `endpoints/regulatory-update/rollback_POST.ts`
- `endpoints/regulatory-update/scan_POST.ts`
- `endpoints/regulatory-update/update_POST.ts`
- `endpoints/responses/admin-review_POST.ts`
- `endpoints/responses/queue-remediation_POST.ts`
- `endpoints/responses/queue_GET.ts`
- `endpoints/scanning-rule/delete_POST.ts`
- `endpoints/scanning-rule/generate-all_POST.ts`
- `endpoints/scanning-rule/generate_POST.ts`
- `endpoints/scanning-rule/list_GET.ts`
- `endpoints/scanning-rule/update_POST.ts`
- `endpoints/statute/create_POST.ts`
- `endpoints/statute/delete_POST.ts`
- `endpoints/statute/update_POST.ts`
- `endpoints/tradeline/backfill-source-text_POST.ts`
- `endpoints/version/change-summary_GET.ts`
- `endpoints/version/create_POST.ts`
- `endpoints/version/delete_POST.ts`
- `endpoints/version/generate-notes_POST.ts`
- `endpoints/version/list_GET.ts`
- `endpoints/version/snapshot_POST.ts`
- `endpoints/version/update_POST.ts`
- `endpoints/version/validate-publish_POST.ts`

## Cron-Token Authenticated (3)

- `endpoints/clock/scan_POST.ts`
- `endpoints/regulation-registry/scheduled-scan_POST.ts`
- `endpoints/retention/auto-purge_POST.ts`

## Webhook-Signature Authenticated (3)

- `endpoints/webhook/postgrid_POST.ts`
- `endpoints/webhook/stripe_POST.ts`
- `endpoints/webhook/tracking_POST.ts`

## Intentionally Test/Local-Only (0)

- None.

Total classified endpoint handlers: 285.
