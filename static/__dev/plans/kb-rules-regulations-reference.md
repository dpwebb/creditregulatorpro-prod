---
created: 2026-04-19T16:17:52.523Z
updated: 2026-04-19T16:17:52.523Z
---

# KB Rules & Regulations Reference

## Summary
Add a comprehensive "Rules & Laws" reference section to the Knowledge Base that lets curious users see exactly which Canadian laws and regulations back each of the 35+ compliance checks. Currently the KB only shows short one-line descriptions of each check module. This new section will map every violation category to its plain-language name and the specific federal/provincial laws the system cites when it finds that error.

## Files to Create

### `components/KBRulesRegulations.tsx` + `.module.css`
A new KB component that displays a comprehensive, user-friendly reference of all rules and regulations. Organized into:

1. **Federal Laws Overview** — A summary section listing the 4 key federal/industry standards used across all checks:
   - PIPEDA Schedule 1, Principle 4.6 (Accuracy)
   - PIPEDA Schedule 1, Principle 4.6.1 (Appropriate Information)
   - PIPEDA Schedule 1, Principle 4.5 (Limiting Retention)
   - PIPEDA Schedule 1, Principle 4.3 (Consent)
   - Bankruptcy and Insolvency Act, R.S.C. 1985, c. B-3, s. 178
   - Metro2 Canadian Credit Reporting Resource Guide (CRRG)
   Each with a plain-language description of what the law says.

2. **All Violation Categories with Laws** — An accordion-based list grouping the ~45 violation categories into logical themes (matching the 35 detection modules in KBCompliance):
   - **Date & Time Problems** (TEMPORAL_MANIPULATION, STATUTE_OF_LIMITATIONS, FURNISHER_REAGING_VIOLATION, DATE_LOGIC_IMPOSSIBLE, LAST_ACTIVITY_DATE_MANIPULATION, STALE_REPORTING_FAILURE)
   - **Balance & Money Problems** (BALANCE_CALCULATION_VIOLATION, CREDIT_LIMIT_MANIPULATION, CLOSED_ACCOUNT_BALANCE_INFLATION, COLLECTOR_UNAUTHORIZED_FEES, COLLECTOR_PAYMENT_ACKNOWLEDGMENT_VIOLATION)
   - **Missing or Wrong Information** (DOCUMENTATION_CHAIN_FAILURE, ACCOUNT_STATUS_INCONSISTENCY, FURNISHER_STATUS_CODE_MISMATCH, PAYMENT_HISTORY_MANIPULATION, RETROACTIVE_HISTORY_MANIPULATION)
   - **Bureau & Investigation Failures** (BUREAU_INVESTIGATION_FAILURE, BUREAU_NOTIFICATION_FAILURE, BUREAU_REINSERTION_VIOLATION, BUREAU_ACCESS_VIOLATION, BUREAU_DISPUTE_MARKING_FAILURE, INVESTIGATION_RUBBER_STAMP, CONSUMER_STATEMENT_SUPPRESSION)
   - **Response Quality Issues** (CREDITOR_RESPONSE_QUALITY, RESPONSE_MOV_MISSING, RESPONSE_INCOMPLETE, RESPONSE_NO_DOCUMENTATION, RESPONSE_ADDRESS_MISMATCH, RESPONSE_UNAUTHORIZED, PROCEDURAL_TIMING_VIOLATION, FURNISHER_POST_DISPUTE_RETALIATION)
   - **Collector Problems** (COLLECTOR_LICENSE_FAILURE, COLLECTOR_DUPLICATE_REPORTING, COLLECTOR_STATUTE_REVIVAL_ATTEMPT, MULTIPLE_COLLECTOR_VIOLATION, PHANTOM_DEBT_UNVERIFIABLE, ZOMBIE_DEBT_RESURRECTION)
   - **Cross-Bureau & Identity Issues** (CROSS_ENTITY_DISCREPANCY, CROSS_BUREAU_INCONSISTENCY, IDENTITY_THEFT_VIOLATION, BANKRUPTCY_DISCHARGE_VIOLATION, FURNISHER_JOINT_ACCOUNT_VIOLATION, FURNISHER_AUTHORIZED_USER_MISREPRESENTATION, DISCLOSURE_DEFICIENCY)

   For each violation category, show:
   - The plain-language label from `getViolationLabel` (e.g., "Balance Doesn't Add Up")
   - A one-sentence Grade-8-level explanation of what it means
   - The specific federal law(s) that apply (PIPEDA section, Bankruptcy Act, Metro2)
   - A note that provincial laws also apply based on the user's province

3. **Provincial Laws by Province** — A collapsible reference showing the statute name and section numbers for each of the 13 provinces/territories, organized by category (accuracy, corroboration, reporting limit, bankruptcy, identity theft, dispute, collection, disclosure, bureau obligations). Data pulled from `PROVINCIAL_CRA_MAPPING` in `regulationConstants.tsx`.

**Design approach:**
- Use Accordion components for each group so the page isn't overwhelming
- Use Badge components to tag severity (ERROR vs WARNING)
- Use plain Grade-8 language for all headings and descriptions
- Import data from `getViolationLabel` and `regulationConstants` directly so it stays in sync with the actual checks
- Use KnowledgeBaseSection for consistent styling with other KB tabs

## Files to Modify

### `pages/user-manual.tsx`
- Import the new `KBRulesRegulations` component
- Add a new tab trigger: "Rules & Laws" (value: `"rules-laws"`) — placed after the "Rule Checks" tab and before the "Rules" tab
- Add corresponding `TabsContent` rendering `<KBRulesRegulations />`

## Approach
1. Create `KBRulesRegulations` component with all three sections (Federal Laws, Violation Categories, Provincial Laws)
2. Import violation labels from `getViolationLabel` and regulation data from `regulationConstants` to keep content in sync with actual system behavior
3. Add the new tab to `user-manual.tsx`
4. All text must be Grade-8 reading level — no legal jargon without a plain explanation

## Risks & Considerations
- **Content length**: With ~45 violation categories and 13 provinces, this is a lot of content. Accordion grouping keeps it manageable and avoids overwhelming the user.
- **Sync with code**: By importing from `getViolationLabel` and `regulationConstants`, the KB stays in sync if new violation types are added later.
- **Grade-8 language**: The raw regulation references (e.g., "R.S.O. 1990, c. C.33, s. 9(3)(a)") must be kept for legal accuracy but presented alongside plain explanations.
- **File size**: The component will be large due to the volume of content. Use accordion grouping and keep each section self-contained.
- **Mobile-app backward compatibility**: This is a frontend-only KB addition — no backend or API changes needed, fully backward compatible.
