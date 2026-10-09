# Security Specification & Test Plan

## 1. Access model

| Role | Definition | Can |
| --- | --- | --- |
| Anyone signed in | Any Firebase account | Ask whether their own address is on the allowlist (`allowed_emails/{their email}`). Nothing else. |
| Team member | Verified email with a document at `allowed_emails/{lowercase email}` | Read all program data; create and edit program data; read/write their own notifications and saved views; create their own profile. |
| Manager | Team member with `user_roles/{uid}.role == 'manager'` | Everything a team member can, plus delete program data and edit taxonomy options. |
| Admin | Team member with `user_roles/{uid}.role == 'admin'` | Everything a manager can, plus add/remove allowlist entries and write `user_roles`. |
| Server | Admin SDK (server functions after a verified team-member token, scheduled hooks after a verified secret, the seed script) | Bypasses rules. |

Signing in never grants access. The first admin is seeded out-of-band (see README, "Access control & bootstrap").

## 2. Data invariants

- Team membership is decided by the allowlist document, not by the client. The client never writes `allowed_emails` or `user_roles` unless it is an admin.
- Email/password accounts must have a verified email to count as team members.
- `profiles/{uid}` belongs to its user: create/update only by that user, only whitelisted fields, email must match the token.
- `notifications` and `saved_views` are private to `user_id`; creating one for someone else is denied.
- `activity_log` is append-only and attributed to the caller (`actor_id == uid`).
- `monitoring_checks` are append-only for clients.
- `job_secrets`, `webhook_runs`, `email_digest_log`, `integration_tokens` are server-only: every client read and write is denied.
- Document IDs satisfy `isValidId` (alphanumeric, `_`, `-`, at most 256 chars); `allowed_emails` IDs are the lowercase address.

## 3. The Dirty Dozen test payloads (all must be denied)

1. **Unauthenticated read** of `/opportunities`.
2. **Unauthenticated write** creating an opportunity.
3. **Signed-in stranger**: a verified account not on the allowlist reads `/opportunities` or `/profiles`.
4. **Self-approval**: that stranger writes `/allowed_emails/<their email>`.
5. **Role escalation**: a team member writes `/user_roles/<their uid>` with `role: 'admin'`, or adds `role` to their profile.
6. **Unverified password account**: registers an allowlisted address with a password (email not verified) and reads data.
7. **Profile spoofing**: user A writes `/profiles/<user B uid>`, or edits their own `email`.
8. **ID injection**: creating a document whose ID contains `/`, `..`, or characters outside the allowed set.
9. **Cross-user notification access**: user A reads, updates or deletes user B's `/notifications` or `/saved_views`; or creates one with B's `user_id`.
10. **Audit-log tampering**: any client updates or deletes `/activity_log`, or creates an entry with another user's `actor_id`.
11. **Secret exfiltration**: any client (including admins) reads `/job_secrets`, `/webhook_runs`, `/email_digest_log` or `/integration_tokens`.
12. **Privilege on delete**: a plain team member (not manager/admin) deletes program data or edits `taxonomy_options`.

## 4. Server-side checks

- Server functions (`requireSupabaseAuth`) reject with 401 when the Bearer token is missing or invalid, and 403 when the verified email is not on the allowlist.
- Scheduled hooks (`/api/public/hooks/*`) return 503 when no secret is configured, 401 when the presented secret is missing or wrong. Scheduler-identifying headers (`x-cloudscheduler`, `User-Agent`) are never accepted as credentials.
- `/api/public/calendar-feed` requires `?token=` matching `job_secrets/calendar-feed`; 503 when unset.
