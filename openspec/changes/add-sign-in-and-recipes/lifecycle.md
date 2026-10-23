# Lifecycle: add-sign-in-and-recipes

- Branch: `add-sign-in-and-recipes`
- Stage: 3 Implement (complete); waiting on human verification
- Review round: 0 of 3
- QA cycle: 0 of 3
- Started: 2026-10-23

## Interview summary

Email and password sign-in; invite-only through an `ALLOWED_EMAILS` allowlist; verified email required; ingredients stored as free text; recipes private to their owner; hard delete with confirmation. Approved by the user when they asked to start applying the tasks.

Not run through the full dev-lifecycle: there is no dev site yet, so there was no independent code review round and no agent-run QA. The code was checked by lint, type check, 107 tests (including integration tests against the Neon dev branch) and a production build.

## Gate A

Approved: yes (user asked to start applying the tasks)
Accepted preflight gaps: no dev site, no Playwright `qa` project, no QA accounts

## Preflight

(not run: dev-lifecycle was not used for this change)

## Review rounds

(none: independent review has not been run)

## Deferred findings

- Deleting a recipe that plans, leftovers or the food log reference will hit non-cascading foreign keys. Nothing references recipes yet; the planner change must decide whether to block the delete or detach.
- Sign-up for an allowlisted address that already has an account says so ("an account already exists"). Only allowlisted addresses can reach that message, so it does not reveal anything to strangers.
- Verification and reset emails use Firebase's default template and sender.
- `checkRevoked` makes every page load call Firebase once more. Fine for a hobby app; cache or drop it if latency matters.

## QA report

(no automated QA yet)

## Verification checklist for the human

Do these on the live site after the production rollout, in this order. Use two real accounts for 7 and 8.

Before the first rollout: set the `ALLOWED_EMAILS` secret (`firebase apphosting:secrets:set ALLOWED_EMAILS`, your address and any others), and in the Firebase console enable Email/Password, turn off "Enable create (sign-up)", and add the App Hosting domain to Authorized domains.

1. **Sign-up email arrives** (risk: high). Go to /signup with an allowlisted email and a new password. Expect "Check your email", and a Firebase verification email within a minute (check spam). Why a person: real email delivery.
2. **Verified sign-in works** (risk: high). Click the link, then sign in at /signin. Expect to land on /recipes, with your email and Sign out in the sidebar.
3. **Unverified sign-in is blocked** (risk: high). Sign up a second allowlisted address and sign in before clicking its link. Expect the amber "Verify your email" notice, no session, and a working "Resend verification email" button.
4. **Not invited** (risk: high). At /signup use an address not on the list. Expect the invite-only message and no new user in Firebase Console → Authentication.
5. **Wrong password** (risk: medium). Expect "Email or password is incorrect." for both a wrong password and an unknown email.
6. **Password reset** (risk: medium). Use "Forgot password?" with a real account and a fake address. Both show the same message; only the real one gets an email, and the link lets you sign in with the new password.
7. **Privacy between users** (risk: high). Signed in as A, create a recipe and copy its address. Signed in as B, open that address. Expect the same "could not find that" page as for a made-up address, and A's recipe missing from B's list.
8. **Removing someone from the allowlist** (risk: medium). Remove B's address from `ALLOWED_EMAILS`, roll out, then reload while signed in as B. Expect to be sent to sign-in with the invite-only message.
9. **Recipe CRUD on a phone** (risk: medium). Add a recipe with a blank-line-separated ingredient list and a bad source link (see the error), fix it, save, edit it, reorder two ingredient lines, search for it, then delete it through the confirmation. Check the layout at phone width and that the sign-in page and sidebar look right.
10. **Session length and sign-out** (risk: low). Sign out, press Back, and confirm protected pages redirect to sign-in.

## Halted

(not halted)
