# Alerting Live Proof Template

Submit sanitized live alert proof as `docs/production-scale/evidence/live-alert-proof.json`.

Required fields:

- Sanitized alert channel ID, not a webhook URL.
- Alert type tested.
- Observed timestamp.
- Delivery success and operator acknowledgement.
- Environment and correlation ID.
- Retry or failure behavior summary.
- Explicit confirmation that the proof contains no secrets, webhook URLs, PII, signed URLs, raw report data, or service credentials.

This template does not send live alerts. It only defines the accepted evidence shape for an operator-submitted proof artifact.
