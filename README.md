# Sahim

Sahim is Shea's contributor app for package barcode evidence and missing product requests.

## Setup

1. For local development, set `EXPO_PUBLIC_API_URL` to the HTTPS GraphQL endpoint in `.env`. The EAS `preview` and `production` profiles provide Shea's public endpoint at build time. Update both profiles if the backend URL changes.
2. Run `yarn install` and `yarn start`.
3. Apply backend migrations, deploy the backend, and create contributor accounts in the Shea Admin web dashboard under Sahim contributors.
4. Build a new binary with `eas build --profile preview` or `eas build --profile production`, then test sign-in, scanning, and photo upload on physical devices. Existing builds cannot receive a missing compile-time URL without a new build.

The app keeps account-scoped drafts and photos on device. It retries queued submissions when active and online; only server-confirmed items show as pending review. Product barcodes are unique and changes never become public before admin approval. A rejected item remains visible with the review note. Photos remain on the device after submission so temporary network failures do not destroy evidence. Only local drafts and failed local items can be deleted in the app; deletion does not cancel a submission already received by the server. Photos that are no longer referenced by another local item are removed with the draft.

## Structure

- `App.tsx` owns session, navigation state, local drafts, and sync orchestration.
- `src/screens/` contains one component per user-facing screen; screens receive actions as props and do not call GraphQL directly.
- `src/components/` contains shared controls and visual styles.
- `src/domain/` contains catalog types and barcode validation without React Native dependencies.
- `src/data/` contains catalog and contribution GraphQL operations plus catalog search caching.
- `src/storage.ts` owns account-scoped local drafts and photo files.

The bundle identifier and package name in `app.json` are placeholders for the Shea organization; confirm ownership before publishing. Contributor invites require working backend email credentials. The backend uploads directory must be persistent and served from the same public origin used by the API.
