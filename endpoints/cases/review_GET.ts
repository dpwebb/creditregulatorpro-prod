import { schema } from "./review_GET.schema";
import { getEffectiveExtraction, AnyDraftExtraction } from "../../helpers/passAEditLogManager";
import { requirePassA, createPassAGatingResponse } from "../../helpers/passAGating";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

import { ExtractedValue, AddressEntry, PhoneEntry, EmploymentEntry, ConsumerProfile } from "../../helpers/passAExtractorTypes";
import { AccountExtraction, InquiryExtraction, InsolvencyPublicRecords, PaymentHistoryEntry } from "../../helpers/fullExtractionTypes";

// Helper to safely get nested value
function getNestedValue(obj: any, path: string): any {
  if (!obj) return undefined;
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

// Helper to render a standard field input
function renderField(
  label: string, 
  path: string, 
  extraction: AnyDraftExtraction, 
  type: "text" | "date" | "number" = "text"
) {
  // The path points to the value wrapper (ExtractedValue<T>)
  // e.g. "consumer_profile.date_of_birth"
  const fieldData = getNestedValue(extraction, path) as ExtractedValue<any> | undefined;
  const value = fieldData?.value ?? "";
  const evidence = fieldData?.evidence;
  
  const evidenceHtml = evidence ? `
    <div class="evidence-panel" id="evidence-${path.replace(/\./g, '-')}" style="display:none;">
      <div class="evidence-meta">
        <span class="badge badge-method">${evidence.source_method}</span>
        <span class="badge badge-page">Page ${evidence.page_number}</span>
        <span class="badge badge-conf">Conf: ${Math.round((fieldData?.confidence || 0) * 100)}%</span>
      </div>
      <div class="evidence-snippet">"${evidence.snippet}"</div>
    </div>
  ` : '';

  const toggleBtn = evidence ? `
    <button type="button" class="btn-icon" onclick="toggleEvidence('${path.replace(/\./g, '-')}')" title="Show Evidence">
      👁️
    </button>
  ` : '';

  return `
    <div class="field-group" data-field-path="${path}">
      <label>${label}</label>
      <div class="input-wrapper">
        <input 
          type="${type}" 
          class="form-input" 
          data-path="${path}" 
          value="${String(value).replace(/"/g, '&quot;')}" 
          onblur="handleSave(this)"
        />
        <div class="actions">
          ${toggleBtn}
          <button type="button" class="btn-icon" onclick="handleReset('${path}')" title="Reset to Original">
            ↺
          </button>
        </div>
      </div>
      ${evidenceHtml}
    </div>
  `;
}

// Helper to render array items (like addresses)
function renderArraySection<T>(
  title: string, 
  items: T[], 
  basePath: string, 
  renderItem: (item: T, index: number, path: string) => string
) {
  if (!items || items.length === 0) {
    return `
      <div class="section">
        <h3>${title}</h3>
        <div class="empty-state">No items found</div>
      </div>
    `;
  }

  return `
    <div class="section">
      <h3>${title}</h3>
      <div class="card-grid">
        ${items.map((item, idx) => renderItem(item, idx, `${basePath}.${idx}`)).join('')}
      </div>
    </div>
  `;
}

// Helper to render account card
function renderAccountCard(account: AccountExtraction, index: number, basePath: string, extraction: AnyDraftExtraction) {
  const creditorName = account.creditor_name?.value || 'Unknown Creditor';
  
  return `
    <div class="card account-card">
      <div class="card-header">
        <span>${creditorName}</span>
        <span class="card-badge">#${index + 1}</span>
      </div>
      
      <div class="field-grid">
        <div class="field-grid-col">
          <h4>Account Details</h4>
          ${renderField("Creditor Name", `${basePath}.creditor_name`, extraction)}
          ${renderField("Account Number", `${basePath}.account_number_partial`, extraction)}
          ${renderField("Account Type", `${basePath}.account_type`, extraction)}
          ${renderField("Responsibility", `${basePath}.responsibility`, extraction)}
          ${renderField("Status", `${basePath}.status`, extraction)}
          ${renderField("Payment Status", `${basePath}.payment_status`, extraction)}
        </div>
        
        <div class="field-grid-col">
          <h4>Dates</h4>
          ${renderField("Date Opened", `${basePath}.date_opened`, extraction, "date")}
          ${renderField("Date Closed", `${basePath}.date_closed`, extraction, "date")}
          ${renderField("Date Reported", `${basePath}.date_reported`, extraction, "date")}
          ${renderField("Last Activity", `${basePath}.date_last_activity`, extraction, "date")}
          ${renderField("Last Payment", `${basePath}.date_last_payment`, extraction, "date")}
          ${renderField("First Delinquency", `${basePath}.date_first_delinquency`, extraction, "date")}
        </div>
        
        <div class="field-grid-col">
          <h4>Amounts</h4>
          ${renderField("High Credit", `${basePath}.high_credit`, extraction, "number")}
          ${renderField("Credit Limit", `${basePath}.credit_limit`, extraction, "number")}
          ${renderField("Balance", `${basePath}.balance`, extraction, "number")}
          ${renderField("Past Due", `${basePath}.amount_past_due`, extraction, "number")}
          ${renderField("Monthly Payment", `${basePath}.monthly_payment`, extraction, "number")}
          ${renderField("Actual Payment", `${basePath}.actual_payment`, extraction, "number")}
        </div>
      </div>
      
      ${account.payment_history && account.payment_history.length > 0 ? `
        <div class="payment-history">
          <h4>Payment History</h4>
          <div class="payment-history-grid">
            ${account.payment_history.slice(0, 24).map((entry: PaymentHistoryEntry, idx: number) => `
              <div class="payment-cell" title="${entry.period?.value || ''}: ${entry.status?.value || ''}">
                <span class="payment-status status-${(entry.status?.value || 'unknown').toLowerCase()}">${entry.status?.value || '?'}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

// Helper to render inquiry card
function renderInquiryCard(inquiry: InquiryExtraction, index: number, basePath: string, extraction: AnyDraftExtraction) {
  const inquirerName = inquiry.inquirer_name?.value || 'Unknown Inquirer';
  
  return `
    <div class="card inquiry-card">
      <div class="card-header">
        <span>${inquirerName}</span>
        <span class="card-badge">#${index + 1}</span>
      </div>
      ${renderField("Inquirer Name", `${basePath}.inquirer_name`, extraction)}
      ${renderField("Inquiry Date", `${basePath}.inquiry_date`, extraction, "date")}
      ${renderField("Phone Number", `${basePath}.phone_number`, extraction)}
      ${renderField("Inquiry Type", `${basePath}.inquiry_type`, extraction)}
    </div>
  `;
}

// Helper to render public record card
function renderPublicRecordCard(record: any, index: number, basePath: string, extraction: AnyDraftExtraction) {
  const recordType = record.record_type?.value || 'Unknown Record';
  
  return `
    <div class="card public-record-card">
      <div class="card-header">
        <span>${recordType}</span>
        <span class="card-badge">#${index + 1}</span>
      </div>
      ${renderField("Record Type", `${basePath}.record_type`, extraction)}
      ${renderField("Filing Date", `${basePath}.filing_date`, extraction, "date")}
      ${renderField("Court Name", `${basePath}.court_name`, extraction)}
      ${renderField("Case Number", `${basePath}.case_number`, extraction)}
      ${renderField("Status", `${basePath}.status`, extraction)}
      ${renderField("Amount", `${basePath}.amount`, extraction, "number")}
    </div>
  `;
}

export async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    
    // Validate input manually since we are returning HTML, not JSON error
    const validation = schema.safeParse(params);
    if (!validation.success) {
      return new Response("Invalid artifact ID", { status: 400 });
    }
    
    const artifactId = parseInt(validation.data.artifactId, 10);

    // Check Pass-A gating
    const passACheck = await requirePassA(artifactId);
    if (!passACheck.success) {
      return createPassAGatingResponse(artifactId);
    }
    
    // Fetch data
    const { effectiveView, editLog, isFullExtraction } = await getEffectiveExtraction(artifactId);
    
    // Identify edited paths for highlighting
    const editedPaths = new Set(editLog.map(e => e.path));

    // --- HTML Generation ---
    
    const bureauContext = effectiveView.bureau_context || {};
    const consumerProfile = (effectiveView.consumer_profile || {
      address_history: [],
      phone_history: [],
      employment_history: [],
    }) as ConsumerProfile;
    const portalSummary = ('portal_summary' in effectiveView ? effectiveView.portal_summary : undefined) || bureauContext.portal_summary || {};
    const bureauContact = bureauContext.bureau_contact || {};

    // Full extraction specific data
    const accounts = isFullExtraction && 'accounts' in effectiveView ? effectiveView.accounts : [];
    const inquiriesCreditRelated = isFullExtraction && 'inquiries_credit_related' in effectiveView ? effectiveView.inquiries_credit_related : [];
    const inquiriesOther = isFullExtraction && 'inquiries_other' in effectiveView ? effectiveView.inquiries_other : [];
    const insolvencyPublicRecords = isFullExtraction && 'insolvency_public_records' in effectiveView ? effectiveView.insolvency_public_records : { section_present: false, records: [] };

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isFullExtraction ? 'Full' : 'Pass-A'} Review: Artifact ${artifactId}</title>
  <style>
    :root {
      --primary: #2563eb;
      --bg: #f8fafc;
      --card: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --text-muted: #64748b;
      --success: #22c55e;
      --warning: #f59e0b;
      --danger: #ef4444;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 20px;
      line-height: 1.5;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border);
    }
    h1 { margin: 0; font-size: 1.5rem; }
    h2 { font-size: 1.25rem; margin-top: 0; color: var(--primary); }
    h3 { font-size: 1rem; margin-bottom: 1rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    h4 { font-size: 0.9rem; margin: 1rem 0 0.5rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 2rem;
      margin-bottom: 2rem;
    }
    
    .section {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      margin-bottom: 2rem;
    }
    
    .field-group {
      margin-bottom: 1rem;
    }
    .field-group label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 0.25rem;
      color: var(--text-muted);
    }
    
    .input-wrapper {
      display: flex;
      gap: 0.5rem;
    }
    
    .form-input {
      flex: 1;
      padding: 0.5rem;
      border: 1px solid var(--border);
      border-radius: 4px;
      font-size: 0.9rem;
      transition: border-color 0.2s, background-color 0.2s;
    }
    .form-input:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
    }
    
    /* Highlight edited fields */
    .form-input[data-edited="true"] {
      background-color: #eff6ff;
      border-color: var(--primary);
    }
    
    .btn-icon {
      background: none;
      border: 1px solid var(--border);
      border-radius: 4px;
      cursor: pointer;
      padding: 0 0.5rem;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .btn-icon:hover {
      background: #f1f5f9;
      color: var(--text);
    }
    
    .evidence-panel {
      margin-top: 0.5rem;
      padding: 0.75rem;
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: 4px;
      font-size: 0.85rem;
    }
    .evidence-meta {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .badge {
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge-method { background: #e0e7ff; color: #3730a3; }
    .badge-page { background: #f3f4f6; color: #1f2937; }
    .badge-conf { background: #dcfce7; color: #166534; }
    
    .evidence-snippet {
      font-family: monospace;
      background: #fff;
      padding: 0.5rem;
      border: 1px solid var(--border);
      border-radius: 2px;
      color: #475569;
    }
    
    .card-grid {
      display: grid;
      gap: 1rem;
    }
    .card {
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 1rem;
      background: #fff;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .card-header {
      font-weight: 600;
      margin-bottom: 0.75rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-badge {
      background: #f1f5f9;
      color: var(--text-muted);
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    
    /* Account card specific styles */
    .account-card .field-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      margin-top: 1rem;
    }
    .field-grid-col {
      display: flex;
      flex-direction: column;
    }
    
    /* Payment history */
    .payment-history {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
    }
    .payment-history-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(30px, 1fr));
      gap: 4px;
      margin-top: 0.5rem;
    }
    .payment-cell {
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      font-weight: 600;
      border-radius: 2px;
      cursor: help;
    }
    .payment-status {
      display: block;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 2px;
    }
    .status-ok { background: #dcfce7; color: #166534; }
    .status-30 { background: #fef3c7; color: #92400e; }
    .status-60 { background: #fed7aa; color: #9a3412; }
    .status-90 { background: #fecaca; color: #991b1b; }
    .status-120 { background: #fca5a5; color: #7f1d1d; }
    .status-unknown { background: #f3f4f6; color: #6b7280; }
    
    #toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: var(--text);
      color: white;
      padding: 10px 20px;
      border-radius: 4px;
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
    }
    #toast.show {
      opacity: 1;
    }
    
    .empty-state {
      color: var(--text-muted);
      font-style: italic;
      text-align: center;
      padding: 1rem;
    }
    
    .extraction-type-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 0.85rem;
      font-weight: 600;
      background: ${isFullExtraction ? '#dcfce7' : '#e0e7ff'};
      color: ${isFullExtraction ? '#166534' : '#3730a3'};
      margin-left: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>
          ${isFullExtraction ? 'Full Extraction' : 'Pass-A'} Review
          <span class="extraction-type-badge">${effectiveView.pass}</span>
        </h1>
        <div style="color: var(--text-muted); font-size: 0.9rem;">Artifact ID: ${artifactId} | Channel: ${effectiveView.channel_guess || 'Unknown'}</div>
      </div>
      <div>
        <a href="/upload-results/${artifactId}" style="text-decoration: none; color: var(--primary);">Back to Results</a>
      </div>
    </header>

    <div class="grid">
      <!-- Bureau Context -->
      <div class="section">
        <h2>Bureau Context</h2>
        ${renderField("Bureau Name", "bureau_context.bureau_name", effectiveView)}
        ${renderField("Report Date", "bureau_context.report_generated_at", effectiveView, "date")}
        ${renderField("TU Case ID", "bureau_context.tu_case_id", effectiveView)}
        ${renderField("Auth Ref", "bureau_context.authentication_reference", effectiveView)}
        
        <h3>Contact Info</h3>
        ${renderField("Phone", "bureau_context.bureau_contact.phone", effectiveView)}
        ${renderField("Toll Free", "bureau_context.bureau_contact.toll_free", effectiveView)}
        ${renderField("Website", "bureau_context.bureau_contact.website", effectiveView)}
      </div>

      <!-- Portal Summary -->
      <div class="section">
        <h2>Portal Summary</h2>
        ${renderField("Credit Score", isFullExtraction ? "portal_summary.credit_score" : "bureau_context.portal_summary.credit_score", effectiveView, "number")}
        ${renderField("Total Accounts", isFullExtraction ? "portal_summary.total_accounts" : "bureau_context.portal_summary.total_accounts", effectiveView, "number")}
        ${renderField("Open Accounts", isFullExtraction ? "portal_summary.open_accounts" : "bureau_context.portal_summary.open_accounts", effectiveView, "number")}
        ${renderField("Closed Accounts", isFullExtraction ? "portal_summary.closed_accounts" : "bureau_context.portal_summary.closed_accounts", effectiveView, "number")}
        ${renderField("Delinquent", isFullExtraction ? "portal_summary.delinquent_accounts" : "bureau_context.portal_summary.delinquent_accounts", effectiveView, "number")}
        ${renderField("Total Balance", isFullExtraction ? "portal_summary.total_balance" : "bureau_context.portal_summary.total_balance", effectiveView, "number")}
        ${renderField("Inquiries (6yr)", isFullExtraction ? "portal_summary.inquiries_6yrs" : "bureau_context.portal_summary.inquiries_6yrs", effectiveView, "number")}
      </div>
    </div>

    <div class="section">
      <h2>Consumer Profile</h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
        ${renderField("Given Name", "consumer_profile.legal_name.given_name", effectiveView)}
        ${renderField("Middle Name", "consumer_profile.legal_name.middle_name", effectiveView)}
        ${renderField("Surname", "consumer_profile.legal_name.surname", effectiveView)}
        ${renderField("Suffix", "consumer_profile.legal_name.suffix", effectiveView)}
        ${renderField("DOB", "consumer_profile.date_of_birth", effectiveView, "date")}
                ${renderField("SIN Status", "consumer_profile.sin_status_indicator", effectiveView)}
        ${renderField("SIN (Masked)", "consumer_profile.social_insurance_number", effectiveView)}
      </div>

      <!-- Addresses -->
      ${renderArraySection<AddressEntry>("Address History", consumerProfile.address_history, "consumer_profile.address_history", (addr, i, path) => `
        <div class="card">
          <div class="card-header">Address ${i + 1}</div>
          ${renderField("Line 1", `${path}.address_line_1`, effectiveView)}
          ${renderField("City", `${path}.city`, effectiveView)}
          ${renderField("Province", `${path}.province`, effectiveView)}
          ${renderField("Postal", `${path}.postal_code`, effectiveView)}
          ${renderField("Status", `${path}.status`, effectiveView)}
          ${renderField("Reported", `${path}.reported_date`, effectiveView, "date")}
        </div>
      `)}

      <div style="height: 1rem;"></div>

      <!-- Phones -->
      ${renderArraySection<PhoneEntry>("Phone History", consumerProfile.phone_history, "consumer_profile.phone_history", (phone, i, path) => `
        <div class="card">
          <div class="card-header">Phone ${i + 1}</div>
          ${renderField("Number", `${path}.phone_number`, effectiveView)}
          ${renderField("Type", `${path}.phone_type`, effectiveView)}
          ${renderField("Reported", `${path}.reported_date`, effectiveView, "date")}
        </div>
      `)}

      <div style="height: 1rem;"></div>

      <!-- Employment -->
      ${renderArraySection<EmploymentEntry>("Employment History", consumerProfile.employment_history, "consumer_profile.employment_history", (emp, i, path) => `
        <div class="card">
          <div class="card-header">Employer ${i + 1}</div>
          ${renderField("Name", `${path}.employer_name`, effectiveView)}
          ${renderField("Occupation", `${path}.occupation`, effectiveView)}
          ${renderField("Status", `${path}.status`, effectiveView)}
          ${renderField("Hire Date", `${path}.hire_date`, effectiveView, "date")}
        </div>
      `)}
    </div>

    ${isFullExtraction ? `
      <!-- Accounts Section -->
      ${accounts.length > 0 ? `
        <div class="section">
          <h2>Accounts / Tradelines</h2>
          <div class="card-grid">
            ${accounts.map((account: AccountExtraction, idx: number) => 
              renderAccountCard(account, idx, `accounts.${idx}`, effectiveView)
            ).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Credit-Related Inquiries -->
      ${inquiriesCreditRelated.length > 0 ? `
        <div class="section">
          <h2>Credit-Related Inquiries</h2>
          <div class="card-grid" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));">
            ${inquiriesCreditRelated.map((inquiry: InquiryExtraction, idx: number) => 
              renderInquiryCard(inquiry, idx, `inquiries_credit_related.${idx}`, effectiveView)
            ).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Other Inquiries -->
      ${inquiriesOther.length > 0 ? `
        <div class="section">
          <h2>Other Inquiries</h2>
          <div class="card-grid" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));">
            ${inquiriesOther.map((inquiry: InquiryExtraction, idx: number) => 
              renderInquiryCard(inquiry, idx, `inquiries_other.${idx}`, effectiveView)
            ).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Insolvency / Public Records -->
      ${insolvencyPublicRecords.section_present || insolvencyPublicRecords.records.length > 0 ? `
        <div class="section">
          <h2>Insolvency / Public Records</h2>
          <div style="margin-bottom: 1rem; padding: 0.5rem; background: ${insolvencyPublicRecords.section_present ? '#fef3c7' : '#dcfce7'}; border-radius: 4px;">
            <strong>Section Present:</strong> ${insolvencyPublicRecords.section_present ? 'Yes' : 'No'}
          </div>
          ${insolvencyPublicRecords.records.length > 0 ? `
            <div class="card-grid" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));">
              ${insolvencyPublicRecords.records.map((record: any, idx: number) => 
                renderPublicRecordCard(record, idx, `insolvency_public_records.records.${idx}`, effectiveView)
              ).join('')}
            </div>
          ` : '<div class="empty-state">No public records found</div>'}
        </div>
      ` : ''}
    ` : ''}

  </div>

  <div id="toast">Saved ✓</div>

  <script>
    const ARTIFACT_ID = ${artifactId};
    const EDITED_PATHS = new Set(${JSON.stringify(Array.from(editedPaths))});

    // Initialize edited states
    document.querySelectorAll('input[data-path]').forEach(input => {
      const path = input.getAttribute('data-path');
      if (EDITED_PATHS.has(path)) {
        input.setAttribute('data-edited', 'true');
      }
    });

    function toggleEvidence(idSuffix) {
      const el = document.getElementById('evidence-' + idSuffix);
      if (el) {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
      }
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2000);
    }

    async function sendPatch(path, op, value) {
      try {
        const payload = {
          artifactId: ARTIFACT_ID,
          patches: [{
            path,
            op,
            value: value,
            reason: "User edit via Review UI",
            source: {
              type: "human_edit",
              timestamp: new Date().toISOString()
            }
          }]
        };

        const res = await fetch('/_api/cases/patch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('Save failed');
        
        const data = await res.json();
        showToast(op === 'set' ? 'Saved ✓' : 'Reset ✓');
        return true;
      } catch (e) {
        console.error(e);
        showToast('Error saving!');
        return false;
      }
    }

    async function handleSave(input) {
      const path = input.getAttribute('data-path');
      const value = input.value;
      
      const success = await sendPatch(path, 'set', value);
      if (success) {
        input.setAttribute('data-edited', 'true');
      }
    }

    async function handleReset(path) {
      if (!confirm('Revert this field to original extraction?')) return;
      
      const success = await sendPatch(path, 'unset', null);
      if (success) {
        // Reload to get original value
        window.location.reload();
      }
    }
  </script>
</body>
</html>
    `;

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });

  } catch (error) {
    console.error("Error rendering review page:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
