---
name: rms-data-integrity
description: Design or review DevForge RMS database changes, tenant isolation, attendance records, payroll calculations, auditability, and safe migrations. Use when work changes persistent business data or financial/timekeeping rules.
---

# RMS Data Integrity

Treat staff timekeeping and payroll as auditable business records, not editable UI state.

## General rules

- Every tenant-owned table carries `shop_id` and every query enforces it.
- Use foreign keys, appropriate uniqueness constraints, check constraints where portable, and indexed tenant/date lookup paths.
- Store timestamps in a consistent timezone-aware representation; define which shop timezone determines attendance dates and payroll periods.
- Store money in fixed-precision decimal or integer minor units, never floating-point arithmetic.
- Migrations must be backward-compatible with the currently deployed application during gradual rollout.
- Backfills must be idempotent, bounded, observable, and separate from normal request handling.
- Never delete or rewrite production history merely to simplify a calculation.

## Staff and authentication

Keep `users` and `staff_profiles` distinct. `staff_profiles.user_id` is optional and unique when present. Deactivating employment must not silently destroy the user, attendance, or payroll history.

## Attendance

- Preserve raw clock events.
- Represent corrections as reviewed adjustments with actor, reason, before/after values, and timestamps.
- Distinguish scheduled absence, approved leave, holiday, weekly off, missing clock event, and unauthorized absence.
- Define overnight shifts, grace periods, breaks, overtime, and duplicate clock-event handling explicitly.
- Payroll consumes an approved attendance summary or snapshot, not mutable raw events.

## Payroll

- Version salary configuration by effective date.
- A payroll run records the inputs and rule versions used.
- Completed payroll runs and issued payslips are immutable.
- Corrections use reversal or adjustment entries in a later controlled operation.
- Require idempotency for generating or finalizing a payroll run.
- Keep allowances, deductions, advances, taxes, overtime, and rounding visible as line items.

## Before implementation

Write down state transitions, approval authority, uniqueness/idempotency keys, transaction boundaries, rounding rules, timezone behavior, retention, and audit requirements. Stop for a business decision when a missing rule can change pay or attendance outcomes.
