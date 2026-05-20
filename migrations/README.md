# Migration Ledger

This directory is the schema migration ledger for CreditRegulatorPro.

Current state: inventory and policy only. Entries in this directory do not execute DDL unless a future audited task explicitly creates an executable migration and wires a tested runner.

Use `pnpm run check:migrations` to generate the non-mutating schema inventory report.
