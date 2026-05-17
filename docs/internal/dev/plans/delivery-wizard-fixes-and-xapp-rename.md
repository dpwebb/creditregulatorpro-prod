---
created: 2026-04-19T05:20:36.805Z
updated: 2026-04-19T05:20:36.805Z
---

# Delivery Wizard: PDF Zoom, Full Address, and XAPP Rename

## Summary
Three changes to the DeliveryWizard and related code:
1. **PDF preview zoom** — Add zoom in/out controls so the letter is readable on mobile phones
2. **Full receiver address** — Replace the vague "Mailing to: the Credit Bureau" with the actual recipient name, department, street address, city, province, and postal code in a clear mailing label format
3. **Rename "xapp" to "crp"** — Remove all internal references to the old "XAPP" name in code variables, step names, HTML IDs, comments, and CSS classes across the codebase

## Files to Modify

### 1. `components/DeliveryWizard.tsx`
- **PDF zoom**: Replace the bare `<Viewer>` with a setup that includes zoom controls (+ / - buttons and a zoom level display). Add `ZoomIn`, `ZoomOut` icons from lucide-react and custom zoom toolbar above the PDF container.
- **Full address**: Update the `xapp-review` step's destination box. Instead of just showing `bureauName` as fallback, render the full structured address clearly: recipient name, department, address line 1, city, province, postal code. Use a friendly label like "This letter will be sent to:" instead of the bare "Mailing to:".
- **Rename xapp → crp**: 
  - Step type: `"xapp-review"` → `"crp-review"`, `"xapp"` → `"crp"`
  - `initialStep` prop type: `"xapp"` → `"crp"` 
  - State variables: `xappReviewed` → `crpReviewed`, `xappApproved` → `crpApproved`
  - Function: `handleXappSuccess` → `handleCrpSuccess`
  - Flow state: `"xapp"` → `"crp"`
  - HTML checkbox IDs: `"xapp-reviewed"` → `"crp-reviewed"`, `"xapp-approved"` → `"crp-approved"`
  - Comments referencing XAPP/xapp → CRP

### 2. `components/DeliveryWizard.module.css`
- Add styles for zoom toolbar (`.zoomToolbar`, `.zoomButton`, `.zoomLevel`)
- PDF container may need slight height adjustments for mobile

### 3. `components/PacketViewer.tsx`
- Update the `useState<"choose" | "xapp" | "self">` type to use `"crp"` instead of `"xapp"`
- Update any references that set the step to `"xapp"` → `"crp"`

### 4. `components/DisputeJourneyTracker.tsx`
- Update `initialStep="xapp"` → `initialStep="crp"`

### 5. `pages/packets.tsx`
- Update any `initialStep="xapp"` or `"xapp"` step references → `"crp"`

### 6. `pages/tradelines.$id.tsx`
- Update any `initialStep="xapp"` or `"xapp"` step references → `"crp"`

## Approach

### Step 1: Rename "xapp" → "crp" across all files
- Update DeliveryWizard.tsx (types, state, functions, HTML IDs, comments)
- Update PacketViewer.tsx, DisputeJourneyTracker.tsx, packets.tsx, tradelines.$id.tsx

### Step 2: Add PDF zoom controls to DeliveryWizard
- Import `ZoomIn`, `ZoomOut`, `RotateCw` from lucide-react
- Add zoom state (`zoomLevel`) with default 1.0
- Add a toolbar above the PDF viewer with zoom in (+0.25), zoom out (-0.25), and current zoom % display
- Use the `<Viewer>` `defaultScale` or `plugins` prop to control zoom, OR use manual CSS transform on the viewer container for simplicity
- Add corresponding CSS for the zoom toolbar

### Step 3: Show full receiver address
- In the `crp-review` step, update the destination box:
  - Change heading to "This letter will be sent to:"
  - When `bureauAddress` is available, show all fields: name, department, address line, city/province/postal code
  - Use a styled mailing-label format (not monospace font — use normal readable font, but structured clearly)
  - When `bureauAddress` is null, show `bureauName` with a note that the full address is in the letter

## Risks & Considerations
- **Backward compatibility**: The `initialStep` prop type changes from `"xapp"` to `"crp"`. All callers (PacketViewer, DisputeJourneyTracker, packets page, tradelines page) must be updated in the same change to avoid runtime mismatches.
- **PDF viewer zoom**: The `@react-pdf-viewer/core` Viewer component supports a `defaultScale` prop and zoom plugins. Using the zoom plugin from the library is preferable to CSS hacks. However, we already have the dependency `@react-pdf-viewer/core@3.11.0` installed — verify the zoom plugin API works with this version.
- **Mobile UX**: The PDF container is 400px tall which may be too much on small screens. Consider making it responsive (e.g., 300px on mobile, 400px on desktop).
- **Address data**: The `bureauDisputeAddresses` helper provides static official addresses for Canadian bureaus. If a bureau isn't in the static data, `bureauAddress` will be null — the fallback must still be clear.
