---
nexus_plan: true
id: "code-signing-and-notarization-credentials"
title: "Code signing and notarization credentials"
status: "draft"
created: "2026-10-03"
updated: "2026-10-03"
owner: "user"
source: "manual:chore"
type: "chore"
parent: null
estimate: "1w"
phase: "maintenance"
tags: ["chore"]
---

## Goal
Get the certificates and credentials that let Nexus Harness installers open without macOS
Gatekeeper or Windows SmartScreen warnings, and store them as GitHub Actions secrets that the
desktop release workflow reads.

## Why
Unsigned apps show "can't be opened / unidentified developer" (macOS) and "Windows protected
your PC" (Windows). Non-technical users will stop there. This has cost and approval lead time, so
it runs in parallel with the code work. **Owner: you (human). The agents can't do this part.**

## Steps
- [ ] **Apple:** enroll in the Apple Developer Program as an organization (GDA Africa). Needs a D-U-N-S number, about $99/yr, and can take days to weeks
- [ ] **Apple:** create a *Developer ID Application* certificate, export it with its private key as `.p12`
- [ ] **Apple:** create an App Store Connect API key (Users and Access → Integrations) for notarization; download the `.p8`
- [ ] **Windows:** pick a signing route. Recommended: **Azure Trusted Signing** (about $10/mo, no hardware token, gets SmartScreen reputation). Alternative: an OV/EV certificate from a CA
- [ ] **Windows (Azure route):** create the Trusted Signing account + certificate profile, complete identity validation, and create an app registration with the signer role
- [ ] Add GitHub Actions secrets on `Glenhalton/nexus-harness`:
      `MAC_CSC_LINK` (base64 of .p12), `MAC_CSC_KEY_PASSWORD`,
      `APPLE_API_KEY` (base64 of .p8), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID`,
      `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`,
      `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT`, `AZURE_TRUSTED_SIGNING_PROFILE`
- [ ] Tell Nexus when the secrets are in, so the release workflow can run a signed build

## Acceptance Criteria
- [ ] All secrets above exist in the repo's Actions secrets
- [ ] A tagged release produces a notarized `.dmg` that opens without warnings on a clean Mac
- [ ] The Windows installer shows "GDA Africa" as the verified publisher

## Notes
- Never commit certificates, `.p12`/`.p8` files or passwords to the repo.

## Evidence
- (to be filled)
