# Sahim

Sahim is Shea's contributor app for package barcode evidence and missing product requests.

## Setup

1. Set `EXPO_PUBLIC_API_URL` to the HTTPS GraphQL endpoint in `.env`.
2. Run `yarn install` and `yarn start`.
3. Apply backend migrations, deploy the backend, and create contributor accounts in the Shea admin app.
4. Test scanning and photo upload on physical Android and iOS devices before building with `eas build --profile production`.

The app keeps account-scoped drafts and photos on device. It retries queued submissions when active and online; only server-confirmed items show as pending review. Product barcodes are unique and changes never become public before admin approval. A rejected item remains visible with the review note. Photos remain on the device after submission so temporary network failures do not destroy evidence.

The bundle identifier and package name in `app.json` are placeholders for the Shea organization; confirm ownership before publishing. Contributor invites require working backend email credentials. The backend uploads directory must be persistent and served from the same public origin used by the API.
