# Level 2 Runtime Audit

`pnpm audit:runtime` supports public-only, SSH-backed, local VPS, and
container-local execution modes.

## Workstation With SSH

Run from the staging repo on a workstation that has staging SSH access:

```bash
pnpm audit:runtime --ssh --ssh-user <user> --ssh-key <path>
```

The SSH mode runs public HTTP/TLS checks from the workstation, then executes
Docker, container, DB, storage, filesystem, OCR/PDF, disk, and log checks on the
staging VPS through SSH.

## Directly On The Staging VPS

Run directly on the VPS when workstation SSH credentials are unavailable:

```bash
cd /opt/creditregulatorpro-staging/app
pnpm audit:runtime --local-vps
```

The local VPS mode runs Docker checks directly on the host. It verifies the
staging app container, expected worker container, Traefik labels, host and
container disk usage, app and worker logs, DB connectivity, storage
write/read/delete, packet PDF storage path write/read/delete, `/tmp`
write/read/delete, `tesseract`, `pdftoppm`, deterministic OCR configuration,
queue table visibility, and recent `storage_read_failed:not_found` log entries.

## Public-Only Partial Audit

Run this when only public staging reachability can be verified:

```bash
pnpm audit:runtime --public-only
```

This mode can pass only as `PUBLIC_ONLY_PARTIAL_PASS`. It does not certify Level
2 completion because Docker, DB, storage, OCR/PDF tooling, and log checks are not
verified.

## Container-Local Partial Audit

If the command is run inside the app container:

```bash
pnpm audit:runtime --container-local
```

This verifies container-local DB, storage, temp directory, OCR/PDF tooling, and
queue visibility. Host-only checks such as Docker inventory, Traefik labels,
host disk usage, and sibling worker logs are reported as unavailable, so this is
not a complete Level 2 certification by itself.

## Completion Semantics

- `FULL_RUNTIME_PASS`: complete Level 2 runtime verification passed.
- `FULL_RUNTIME_PASS_WITH_WARNINGS`: complete Level 2 access succeeded, with
  non-blocking runtime warnings.
- `PLATFORM_FAILURE`: required runtime access succeeded, but one or more platform
  checks failed.
- `AUDIT_ACCESS_FAILURE`: the audit could not access required host/container
  diagnostics.
- `PUBLIC_ONLY_PARTIAL_PASS`: public HTTP/TLS checks passed, but container-level
  checks were intentionally skipped.
- `CONTAINER_LOCAL_PARTIAL_PASS`: container-local checks ran, but host-only
  checks were unavailable.
