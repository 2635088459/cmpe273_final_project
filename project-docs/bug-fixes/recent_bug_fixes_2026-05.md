# Recent Bug Fixes (Last Few Days)

**Project:** EraseGraph  
**Period:** 2026-05-07 to 2026-05-09  
**Author:** Haoyuan Shan

---

## 1) Backend CrashLoop after attestation deployment

### Symptom
- Backend pod kept restarting after deploying signed attestation feature.
- Deletion API became unavailable.

### Root cause
- Dependency injection failed in NestJS.
- `ProofAttestationService` was not properly available in `deletion-request` module context.

### Fix
- Imported `ProofModule` into `deletion-request.module.ts`.
- Ensured `ProofAttestationService` is exported from `proof.module.ts`.
- Rebuilt backend image and redeployed.

### Verification
- Backend pod reached `Running` state.
- Attestation endpoints returned `200`.

---

## 2) Attestation card not visible in frontend

### Symptom
- Backend API returned attestation data correctly.
- UI still did not show the attestation card.

### Root cause
- Frontend render path had weak fallback states.
- Deployment/cache confusion made old bundle still served at times.

### Fix
- Added explicit loading/error/retry states in attestation section.
- Strengthened rendering logic in `Home.tsx`.
- Redeployed frontend and verified new bundle hash.

### Verification
- Card appears in dashboard proof panel.
- Error and retry behavior works when request fails.

---

## 3) Frontend compile failure after stash + pull

### Symptom
- Frontend build failed after restoring stash.
- TypeScript error reported duplicate function declaration.

### Root cause
- `getSlaViolations` was defined twice in `frontend/src/services/api.ts` due to merge overlap.

### Fix
- Removed duplicate declaration.
- Kept one clean function definition.

### Verification
- `npm run build` passed.
- Frontend deployment succeeded.

---

## 4) "Services Verified" UI overflow / broken display

### Symptom
- Attestation section had messy text in "Services Verified".
- Long data was not wrapped correctly.

### Root cause
- Incoming required-services field shape was not normalized.
- CSS layout was not robust for longer content.

### Fix
- Normalized required services data in frontend logic.
- Changed display to count + chips.
- Updated CSS for wrapping and spacing.

### Verification
- Field is readable on desktop and mobile.
- No overflow in common demo data cases.

---

## 5) Frontend Docker build context issues

### Symptom
- Frontend image build was slower and sometimes unstable.

### Root cause
- Build context included unnecessary files.

### Fix
- Added `frontend/.dockerignore`.
- Reduced context size for cleaner Docker build.

### Verification
- Build became more stable and predictable.

---

## 6) Backend rollout seemed stuck (Kubernetes)

### Symptom
- `kubectl rollout status` stayed at "old replicas are pending termination" for a while.

### Root cause
- New pod was still in `ContainerCreating`, so old replica had not terminated yet.

### Fix
- Inspected pods and deployment events.
- Waited for new pod readiness, then rollout finished normally.

### Verification
- Deployment reached "successfully rolled out".
- New image tag confirmed in deployment spec.

---

## 7) Demo users not enough for presentation

### Symptom
- Demo data had only 5 users; not enough variety for testing.

### Root cause
- Seed list in `users.service.ts` had limited entries.

### Fix
- Extended demo seeds from 5 to 10 users.
- Added: `frank`, `grace`, `heidi`, `ivan`, `judy`.
- Built and rolled out new backend image.

### Verification
- Called `POST /api/users/restore-demo`.
- `GET /api/users` returned 10 users.

---

## Final status

- Signed attestation is working end-to-end.
- Frontend attestation UI is visible and stable.
- Backend and frontend are both deployed in cloud with latest fixes.
- Demo dataset and proof flow are ready for presentation.

---

## Quick lesson learned

1. Always add explicit loading/error UI for async cards.
2. After stash merge, run build immediately to catch duplicate symbols.
3. For cloud debugging, verify live bundle hash, not only local code.
4. Keep module imports/exports clear in NestJS to avoid DI runtime crashes.
