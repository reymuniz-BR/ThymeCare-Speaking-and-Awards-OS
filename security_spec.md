# Security Specification & Test Plan

## 1. Data Invariants

- Only authenticated users can read or write data in the system.
- User profiles at `/profiles/{userId}` are strictly owned by the corresponding `request.auth.uid`.
- Opportunities and Submissions can only be written by authenticated users with verified email/session.
- Documents enforce maximum field size limits to prevent Denial of Wallet attacks.
- Document IDs must match standard alphanumeric character sets (`isValidId`).
- System-level role fields cannot be escalated by unauthorized clients.

## 2. The Dirty Dozen Test Payloads

1. **Unauthenticated Read**: Attempting to read `/opportunities` without `request.auth`.
2. **Unauthenticated Write**: Attempting to create an opportunity anonymously.
3. **Profile Spoofing**: User A attempting to write `/profiles/userB`.
4. **ID Injection Attack**: Writing to an invalid path with junk characters like `/opportunities/../../../etc/passwd`.
5. **Denial of Wallet (Payload Bloat)**: Sending a 10MB string payload in `description`.
6. **Shadow Field Injection**: Adding arbitrary unauthorized root fields to a submission.
7. **Role Escalation Attack**: Normal user attempting to update their profile role to `admin`.
8. **Orphaned Record Creation**: Submitting answers to non-existent submission IDs.
9. **Tampering with Immutable Timestamps**: Overwriting `created_at` with a forged future timestamp.
10. **Cross-Tenant Notification Access**: User A attempting to read `/notifications` intended for User B.
11. **Malicious Script in Bio**: XSS script tag injection in speaker bios.
12. **Audit Log Erasure**: Any user attempting to delete from `/activity_log`.
