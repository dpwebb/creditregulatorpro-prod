================================================================================
CREDIT REGULATOR PRO - CANADIAN CREDIT COMPLIANCE AUDIT ENGINE
================================================================================

OVERVIEW
--------
Credit Regulator Pro is a serverless application designed to manage credit bureau
compliance auditing exclusively within Canada. The system enforces strict regulatory
compliance with Canadian regional restrictions, evidence retention policies,
and procedural safeguards.

================================================================================
POLICY ENFORCEMENT
================================================================================

REGION: CANADA ONLY
  - All data storage restricted to Canadian region (CA)
  - No cross-border data transfer permitted
  - Enforced at database write level via region='CA' constraint
  - All user accounts must have CA residency validation

EVIDENCE RETENTION: 1 YEAR
  - Report artifacts expire after 365 days from creation
  - Automated daily purge job removes expired evidence
  - External trigger required for scheduled purge execution
  - Immutable hash chain maintained during retention period

RESPONSE CLOCKS
  - Ontario: 30-day response clock (CRA compliance)
  - Nova Scotia: 30-day response clock (CRA compliance)
  - Quebec: 60-day response clock (A-8.2 Credit Agent compliance)
  - Automated daily clock scan detects expired response windows
  - External trigger required for scheduled clock scan execution

TERMINAL LABEL
  - Standardized terminal label: "PHASE 4: PROCEDURAL EXHAUSTION — PENDING"
  - All dispute packets must use standardized label
  - No alternative labels permitted in UI or generated documents

================================================================================
CORE TABLES
================================================================================

user_account
  - Stores user credentials and CA residency status
  - Primary key: user_id
  - Enforces region='CA'

report_artifact
  - Stores credit report documents and metadata
  - Indexed by evidence_event
  - Enforces region='CA'
  - Purged after 365 days via automated job

bureau
  - Stores credit bureau details (Equifax, TransUnion, etc.)
  - Non-expiring reference data

furnisher
  - Stores creditor/furnisher information
  - Non-expiring reference data

tradeline
  - Individual trade lines extracted from credit reports
  - References bureau, furnisher, statute tables
  - Region-specific indexed by evidence_event

statute
  - Template statute definitions for different provinces
  - Response clock definitions per jurisdiction
  - Non-expiring reference data

obligation
  - Abstract debt obligations derived from tradelines
  - References statute, tradeline
  - Immutable once created

obligation_instance
  - Indexed by tradeline_id and state
  - Tracks state transitions through procedural phases
  - Linked to packet generation events

packet
  - Generated dispute letters in PDF format
  - Immutable hash chain references
  - Terminal label included in all packets

evidence_event
  - Immutable audit log of all packet and dispute events
  - Indexed by region and timestamp
  - Hash chain links events together
  - Provides procedural compliance evidence

================================================================================
SERVERLESS FUNCTIONS
================================================================================

1. POST /_api/ingest/report
   Purpose: Upload credit reports
   Input: Binary report file, user_id, report_type
   Output: report_artifact record with generated ID
   Region Enforcement: Validates user CA residency
   Storage: Stores in CA region only

2. POST /_api/rules/evaluate
   Purpose: Parse reports and create obligations
   Input: report_artifact_id
   Output: List of obligations and tradelines created
   Region Enforcement: All records created with region='CA'
   Logic: Extracts trade lines, matches to statute templates

3. POST /_api/planner/select
   Purpose: Select highest priority obligation for dispute
   Input: user_id
   Output: Selected obligation with priority score
   Algorithm: Prioritizes by:
     - Response clock expiration urgency
     - Debt amount
     - Violation type severity
     - Evidence quality
   Guardrails: Only suggests obligations not yet disputed

4. POST /_api/packet/build
   Purpose: Generate dispute letter PDF and packet record
   Input: obligation_id, user_id
   Output: packet record, PDF binary data
   Terminal Label: All packets include standardized label
   PDF Generation: Uses pdfmake library
   Hash Chain: References previous event hash
   Storage: Packet stored in CA region

5. POST /_api/clock/scan
   Purpose: Scan for expired response windows
   Trigger: External scheduled job (daily recommended)
   Input: None
   Output: List of expired obligations with action items
   Region Enforcement: Scans all CA region data
   Logic: Compares statute clock with obligation_instance created_at
   Response: Returns obligations exceeding response clock
   Note: Requires external orchestration (e.g., cron service)

6. POST /_api/webhook/tracking
   Purpose: Handle tracking webhooks from delivery services
   Trigger: Public webhook endpoint (no authentication required)
   Input: Tracking event data
   Output: evidence_event record created
   Use Case: Tracks when dispute letters reach bureaus
   Hash Chain: Links to previous packet event
   Guardrails: Validates source authorization

7. POST /_api/admin/purge
   Purpose: Purge expired report artifacts and associated data
   Trigger: External scheduled job (daily recommended)
   Input: None
   Output: Count of purged artifacts, obligations, tradelines
   Region Enforcement: Purges CA region data only
   Retention Logic: Deletes records where created_at < NOW() - 365 days
   Cascade: Cascades deletes through related tables
   Note: Requires external orchestration; no automatic execution

================================================================================
FRONTEND PAGES
================================================================================

/dashboard
  Purpose: System readiness and recent evidence overview
  Shows:
    - Evidence inventory (report count, retention status)
    - Recent obligations created
    - Active disputes in progress
    - Response clock urgency indicators
    - Cloud region and retention policy confirmation
  Guardrails: Displays standardized terminal label

/upload
  Purpose: Upload credit reports
  Features:
    - File upload form (PDF/image support)
    - CA residency validation
    - Report preview
    - File size limits
  Flow:
    1. User uploads report file
    2. Validation checks for CA residency
    3. Report stored as report_artifact
    4. Redirect to evidence review

/tradeline/{id}
  Purpose: View tradeline details and generate packets
  Shows:
    - Tradeline summary (amount, furnisher, status)
    - Associated statute and response clock
    - Created obligations
    - Packet history
  Features:
    - Preview dispute letter before generation
    - Generate packet button (builds PDF)
    - View generated packets
    - Terminal label confirmation

/tradelines
  Purpose: List all tradelines
  Shows:
    - Table of tradelines
    - Sort by: furnisher, amount, statute, response clock status
    - Filter by: region, status, dispute stage
    - Quick links to individual tradeline details
  Features:
    - Bulk selection
    - Batch operations
    - Export functionality

/bureaus
  Purpose: Manage credit bureaus
  Shows:
    - List of bureaus (Equifax, TransUnion, etc.)
    - Contact information
    - Response clock policies per province
  Features:
    - Add/edit bureau contacts
    - Configure response clock overrides per bureau
    - View bureau-specific obligations

/packets
  Purpose: View generated packets
  Shows:
    - List of all generated dispute packets
    - Sort by: creation date, status, deadline
    - Filter by: bureau, tradeline, status
  Features:
    - View/download packet PDF
    - Track delivery status
    - Resend packet option
    - View evidence chain for packet

================================================================================
EVIDENCE CHAIN & AUDIT LOG
================================================================================

IMMUTABLE HASH CHAIN
  - Each packet and tracking event generates evidence_event record
  - Each event includes hash of previous event (creates chain)
  - Provides immutable audit trail for procedural compliance
  - Enables detection of tampering or missing records
  
HASH CALCULATION
  - Algorithm: SHA-256
  - Input: Event data + previous_event_hash
  - Output: Current event hash
  - Stored: In evidence_event.hash field

EVIDENCE_EVENT TABLE STRUCTURE
  - event_id: Unique identifier
  - packet_id: References generated packet (nullable)
  - event_type: "packet_generated" | "tracking_received" | etc.
  - previous_hash: Hash of prior event (nullable for first)
  - current_hash: Hash of this event
  - created_at: Timestamp
  - region: "CA" (enforced)
  - Indexed by: region, created_at (for scanning)

AUDIT CHAIN VALIDATION
  - Each new event validates previous hash exists
  - Hash chain breaks indicate missing or tampered records
  - Alerts generated if validation fails

================================================================================
STATUTE TEMPLATES
================================================================================

ONTARIO - CONSUMER REPORTING ACT (CRA)
  Jurisdiction: Ontario
  Response Clock: 30 days
  Regulation: Furnishers must respond to disputes within 30 days
  Template Phrases: "Pursuant to Ontario's CRA..."
  Used in: Packets disputed to Ontario bureaus

NOVA SCOTIA - CRA
  Jurisdiction: Nova Scotia
  Response Clock: 30 days
  Regulation: Furnishers must respond within 30 days
  Template Phrases: "Pursuant to Nova Scotia's CRA..."
  Used in: Packets disputed to Nova Scotia bureaus

QUEBEC - CODE OF CIVIL PROCEDURE / A-8.2 (CREDIT AGENTS)
  Jurisdiction: Quebec
  Response Clock: 60 days (longer for Quebec)
  Regulation: Credit agents follow special A-8.2 procedures
  Template Phrases: "Pursuant to Quebec's A-8.2..."
  Used in: Packets disputed to Quebec bureaus

STATUTE MATCHING LOGIC
  - System matches tradeline jurisdiction to statute
  - Response clock applies from packet creation date
  - Clock scan monitors for expiration
  - Alerts generated 5 days before expiration

================================================================================
DEPLOYMENT & OPERATIONS
================================================================================

SCHEDULED JOB REQUIREMENTS
  The following functions require external orchestration:
  
  1. Clock Scan (/_api/clock/scan)
     Recommended frequency: Daily at 00:00 UTC
     Purpose: Detect expired response windows
     Action: Alerts on obligations past response clock
     
  2. Purge Job (/_api/admin/purge)
     Recommended frequency: Daily at 01:00 UTC
     Purpose: Delete expired report artifacts
     Retention: 365 days from creation_at
     Action: Removes expired evidence per policy

  EXTERNAL TRIGGER METHODS
  - AWS EventBridge rules (cron expression)
  - Google Cloud Scheduler
  - Custom cron service with HTTP endpoint
  - Manual execution via admin dashboard (not recommended)

SANDBOX DOMAIN
  Preview/Development: https://d7b7a121-ad3e-49cc-87b0-82af4360a550.sandbox.floot.app
  
  IMPORTANT LIMITATIONS:
  - Frontend pages only work as iframe in Floot, not direct access
  - /_api/ routes are accessible for webhook debugging
  - Use fullscreen button in Floot for standalone testing
  - Publish to deploy to production

REGION CONFIGURATION
  - All connections route to Canadian datacenters
  - Data residency strictly enforced
  - Cross-border transfer blocked at network level
  - Compliance verified at deployment

================================================================================
ENFORCEMENT IMPLEMENTATION
================================================================================

TERMINAL LABEL ENFORCEMENT
  All packets must include: "PHASE 4: PROCEDURAL EXHAUSTION — PENDING"
  Implementation:
  - Template variable in packet generation
  - Validation check before PDF creation
  - Verification in evidence_event record

REGION ENFORCEMENT
  All database writes enforce region='CA':
  - Database constraint: region column NOT NULL DEFAULT 'CA'
  - API validation: region parameter rejected if not 'CA'
  - User validation: CA residency checked on account creation
  - Query filtering: All SELECT statements filter by region='CA'

================================================================================
ERROR HANDLING & RECOVERY
================================================================================

VALIDATION ERRORS
  - Region mismatches: Return 403 with region requirement
  - Missing scheduled job: Return 202 (accepted, job queued)
  - Clock expiration: Alert but allow submission with warning

RECOVERY PROCEDURES
  - Expired reports: Not recoverable, await next purge cycle
  - Failed packet generation: Retry button available
  - Broken hash chain: Admin alert, investigation required
  - Failed webhook delivery: Retry queue with exponential backoff

================================================================================
TESTING CHECKLIST
================================================================================

BEFORE PRODUCTION DEPLOYMENT:
  ☐ Upload test report and verify CA region enforcement
  ☐ Generate packet and confirm terminal label present
  ☐ Execute clock scan and verify expiration detection
  ☐ Execute purge job with test data > 365 days old
  ☐ Verify webhook delivery to tracking endpoint
  ☐ Confirm all API endpoints reject non-CA regions
  ☐ Check evidence hash chain integrity
  ☐ Validate statute templates match jurisdiction
  ☐ Test scheduled jobs with external trigger

================================================================================
VERSION & CHANGELOG
================================================================================

VERSION: 1.0.0
CREATED: 2024
STATUS: Ready for initial deployment

INITIAL FEATURES:
- Canada-only region enforcement
- 1-year evidence retention
- Response clock management (ON/NS/QC)
- Immutable evidence chain
- PDF packet generation
- Automated purge and clock scan

================================================================================
END OF DOCUMENTATION
================================================================================