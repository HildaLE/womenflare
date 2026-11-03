# Store submission

## Public URLs

- Privacy policy: `https://womenflare.hilda-demo-account1783.workers.dev/privacy/`
- Support: `https://womenflare.hilda-demo-account1783.workers.dev/support/`
- Support email: `hedimo@cloudflare.com`

These pages must remain public. Cloudflare Access should protect `/admin` only.

## App Store Connect

- Bundle ID: `com.cloudflare.womenflare`
- Privacy Policy URL: use the privacy URL above.
- Support URL: use the support URL above.
- Export compliance: the app does not use non-exempt encryption; this is declared in `app.json`.
- App Privacy: disclose the participant name or pseudonym, quiz answers, score, ranking, and necessary diagnostics. They are used for app functionality and security, are not used for tracking or advertising, and participation data is retained for at most 24 hours after the quiz.

## Google Play Console

- Package name: `com.cloudflare.womenflare`
- Privacy policy: use the privacy URL above.
- App support/contact: use the support URL and email above.
- Data Safety: disclose the participant name or pseudonym, quiz answers, score, ranking, and necessary diagnostics. Data is used for app functionality and security, is not sold, and participation data is deleted within 24 hours after the quiz.
- The participant flow does not create an account, so participant account-deletion functionality is not applicable.

Store privacy questionnaires change over time. Review the final answers against the production configuration and obtain legal approval before submission.

## EAS

Run from `mobile`:

```bash
npx eas-cli@latest build --platform all --profile production
npx eas-cli@latest submit --platform all --profile production
```
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production
