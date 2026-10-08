# Harness changes proposed for approval

**Approved and applied.** The user approved this scope on 2026-10-07 before
the protected files were edited. Sixteen synthetic hook regressions pass.
The human-only integrity baseline has not been regenerated.

## Findings

1. `.claude/settings.json` registers `protect-files.sh` for writes only. Its
   enumerated environment-read denies omit names such as `.env.preview` and
   `.env.backup`. The project documentation claims a broader deny than exists.
2. `protect-files.sh` extracts basenames using `/`, so a Windows path with
   backslashes can miss both secret and governance checks. Relative `./` and
   `..` paths can also miss anchored checks.
3. The hook hard-blocks GitHub workflow writes, contradicting AGENTS.md's claim
   that these are ordinary reviewed code and the user's request to reserve hard
   blocks for high-security material.
4. The integrity verifier hashes HEAD, not proposed changes, and is absent from
   the current CI workflow despite documentation saying otherwise. It is a
   drift signal, not a tamper-proof security boundary.
5. The prompt guard rejects quoted injection phrases as if they were attacks.
   That can block ordinary security investigation. Pattern matching is not an
   authorization mechanism.
6. AGENTS.md and the constitution say anyone can insert orders and read active
   booths directly. Later migrations revoke those paths and require RPCs.

## Exact requested scope

- **`.claude/settings.json`:** change the first hook matcher from `Edit|Write`
  to `Read|Edit|Write`. Keep existing secret-deny rules and protected-file asks.
- **`.claude/hooks/protect-files.sh`:** normalize `file_path`/`path` through
  Node's `path.resolve` and `path.relative(process.cwd(), ...)`, then normalize
  separators before matching. Hard-block reads and writes of `.env*` except
  `.env.example` and `.env.default`, secret directories and credential files.
  After those checks, return success for read-only access. Keep governance writes
  at `permissionDecision: ask`. Replace the pipeline hard block with an ask
  explaining that workflow execution changes need review. Produce decision JSON
  with `JSON.stringify` so unusual filenames cannot break it.
- **`.claude/hooks/user-prompt-guard.cjs`:** keep credential-pattern hard blocks;
  make injection-phrase matches advisory context instead of blocking the prompt.
  This permits investigation of malicious text without trusting its instructions.
- **`AGENTS.md` and `docs/CONSTITUTION.md`:** replace the stale public-table
  description with: "Customer ordering uses constrained SECURITY DEFINER RPCs;
  anon/authenticated callers cannot directly insert orders. Authenticated vendor
  reads and writes remain RLS-scoped. Public booth data comes from the sanitized
  ordering RPC." Replace the stale TanStack Query stack claim and obsolete
  read-deny/CI-integrity claims with the actual checked configuration.

No permission bypasses, new required tools, blanket file-edit blocks, or
automatic baseline regeneration are proposed. The human-only integrity baseline
must be reviewed and regenerated after approved guard changes are committed.

## Verification before applying

Use synthetic hook inputs only: forward-slash, backslash, absolute and relative
secret paths must deny; `.env.example` must allow; application code must allow;
governance and workflow writes must ask; their reads must allow. Check that
literal quoted injection examples do not block legitimate prompts, while dummy
credential-shaped test fixtures still trigger the credential guard. Do not use
real credentials in these tests.
