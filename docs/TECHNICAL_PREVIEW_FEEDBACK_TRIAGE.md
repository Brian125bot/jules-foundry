# Linux Feedback and Triage

Use this template for the stable `v1.0.0` Linux x64 (`linux-x64`) release. It is designed for public GitHub issues and for maintainers’ follow-up triage. Jules Foundry supports a **single operator on one Linux machine** running the loopback-only local service. It does not claim macOS or Windows support.

> **Never include secrets or sensitive local data.** Do not post provider tokens, `.env` files, local databases, backups, browser cookies, one-time bootstrap URLs, unredacted request bodies, or proprietary repository contents. Report suspected vulnerabilities privately through the path in [SECURITY.md](../SECURITY.md).

## Reporter issue template

Copy the following into a new public issue. Delete any prompt that does not apply.

```markdown
## Preview feedback summary

<!-- One sentence: what did you attempt, and what happened? -->

## Classification

- [ ] Install or startup
- [ ] Credential vault or provider setup
- [ ] Browser workspace or local session
- [ ] Initiative, task planning, or dispatch
- [ ] Evidence, backup, or recovery
- [ ] Documentation or usability
- [ ] Other

## Environment

| Field | Value |
|---|---|
| Release | `v1.0.0` |
| Linux distribution and version | <!-- e.g., Ubuntu 24.04 --> |
| CPU architecture | <!-- expected: x64 --> |
| Node.js version | <!-- `node --version` --> |
| pnpm version, if using the contributor path | <!-- `pnpm --version` --> |
| Installation path | <!-- direct-user archive / clone-and-run --> |
| Browser and version | <!-- e.g., Chromium 126 --> |

## Steps to reproduce

1. 
2. 
3. 

## Expected result

<!-- Describe the behavior you expected. -->

## Actual result

<!-- Describe what occurred, including whether the local browser page opened. -->

## Safe diagnostic details

<!-- Include only redacted error messages and timestamps. Do not include tokens, URLs containing bootstrap parameters, provider responses, private repository paths, database contents, or backups. -->

## Workaround or frequency

<!-- Is the behavior repeatable? Is there a safe workaround? -->

## Impact

<!-- Blocked / major degradation / minor degradation / documentation only -->

## Confirmation

- [ ] I removed credentials, bootstrap URLs, local data, and proprietary content.
- [ ] This is not a security vulnerability; if it is, I will use the private reporting path in `SECURITY.md`.
```

## Maintainer triage template

Copy this section into the issue description, a private maintainer note, or a linked tracking issue after reviewing the reporter’s submission.

```markdown
## Triage record

| Field | Decision |
|---|---|
| Intake date | |
| Triage owner | |
| Affected release / commit | |
| Reproduced | Yes / No / Needs reporter follow-up |
| Scope | Stable Linux x64 release |
| Reporter data redacted | Yes / Needs remediation |
| Security escalation required | Yes / No |

## Severity and disposition

| Level | Use when | Initial response |
|---|---|---|
| P0 | Security concern, credential exposure, data loss, or loopback boundary failure | Move to private security reporting; stop public troubleshooting. |
| P1 | Cannot install, start, or use a core local workflow on supported Linux x64 | Assign an owner and target the earliest patch release. |
| P2 | Core workflow works with a workaround or notable degradation | Prioritize by repeatability and user impact. |
| P3 | Documentation, visual polish, or low-impact usability issue | Batch with documentation or usability maintenance. |

## Reproduction and evidence

- Minimal safe reproduction:
- Redacted local evidence reviewed:
- Related issues or regressions:
- Proposed owner and milestone:

## Decision

- [ ] Close as not reproducible or out of scope
- [ ] Document a workaround
- [ ] Fix in patch release
- [ ] Escalate privately under `SECURITY.md`
- [ ] Track for a future Linux release
```

## Weekly release review

Review newly filed issues at least weekly while the release is supported. Group reports by install/startup, credential setup, browser session, provider workflow, local data safety, and documentation. Promote a defect to P1 when it blocks a supported Linux x64 user from completing a core local workflow without a reasonable workaround. Publish only redacted summaries of recurring provider or security patterns.

## Maintainer exit criteria for the next release update

Before issuing another Linux release, confirm that P0 security reports have followed the private path, P1 reports have a disposition, new release notes contain known workarounds, and the archive, checksum, SBOM, manifest, and release notes are reviewed together.
