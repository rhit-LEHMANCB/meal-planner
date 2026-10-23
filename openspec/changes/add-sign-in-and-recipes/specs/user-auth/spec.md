# Spec Delta

## Purpose

Controls who can use the meal planner: only invited people with a verified email can hold a session, and everything except the sign-in pages requires one.

## ADDED Requirements

### Requirement: Only allowlisted emails can create an account

The system SHALL create an account only when the submitted email is on the configured allowlist. Email comparison SHALL ignore letter case and surrounding spaces. Accounts SHALL NOT be creatable by any other route.

#### Scenario: Allowlisted email signs up

- **WHEN** a visitor submits the sign-up form with an allowlisted email and a valid password
- **THEN** an account is created and the visitor is told to verify their email

#### Scenario: Email not on the allowlist

- **WHEN** a visitor submits the sign-up form with an email that is not on the allowlist
- **THEN** no account is created and the visitor sees a message that the app is invite-only

#### Scenario: Allowlist match ignores case

- **WHEN** the allowlist contains `Cook@Example.com` and a visitor signs up as `cook@example.com`
- **THEN** the sign-up succeeds

#### Scenario: Weak password

- **WHEN** a visitor submits a password shorter than 8 characters
- **THEN** no account is created and the form shows that the password is too short

### Requirement: Email must be verified before a session starts

The system SHALL NOT start a session for an account whose email is unverified. It SHALL send a verification email at sign-up and on request.

#### Scenario: Unverified user tries to sign in

- **WHEN** a user with an unverified email signs in with the correct password
- **THEN** no session starts and the user is told to verify their email, with an option to resend the verification email

#### Scenario: Verified user signs in

- **WHEN** a user with a verified, allowlisted email signs in with the correct password
- **THEN** a session starts and the user lands on the recipes page

### Requirement: Sessions require an allowlisted, verified account

The system SHALL start a session only for an account that is both verified and currently on the allowlist. Removing an email from the allowlist SHALL end that user's access without deleting their data.

#### Scenario: Removed from the allowlist

- **WHEN** an existing user's email is removed from the allowlist and they next load a page or sign in
- **THEN** they have no session and see the invite-only message

#### Scenario: Wrong password

- **WHEN** a user submits a wrong password
- **THEN** no session starts and the form shows a generic "email or password is incorrect" message that does not reveal whether the email has an account

### Requirement: Users can reset their password

The system SHALL let a user request a password reset email from the sign-in area. The response SHALL be the same whether or not the email has an account.

#### Scenario: Request a reset

- **WHEN** a user submits their email on the reset page
- **THEN** the page says that if the email has an account a reset link was sent

#### Scenario: Unknown email

- **WHEN** a visitor submits an email with no account
- **THEN** the page shows the same message as for a known email and no email is sent

### Requirement: Users can sign out

The system SHALL end the session when the user signs out and SHALL send them to the sign-in page.

#### Scenario: Sign out

- **WHEN** a signed-in user chooses Sign out
- **THEN** the session ends and visiting any protected page redirects to the sign-in page

### Requirement: Protected pages require a session

The system SHALL redirect any request without a valid session to the sign-in page, except the sign-in, sign-up, reset and health-check routes. Sessions SHALL expire after 5 days.

#### Scenario: Signed-out visit to a protected page

- **WHEN** a visitor without a session requests `/recipes`
- **THEN** they are redirected to the sign-in page

#### Scenario: Health check stays public

- **WHEN** anyone requests `/api/health`
- **THEN** it responds without requiring a session

#### Scenario: Expired session

- **WHEN** a session is older than 5 days
- **THEN** the next request redirects to the sign-in page

#### Scenario: Signed-in user opens the sign-in page

- **WHEN** a signed-in user requests the sign-in page
- **THEN** they are redirected to the recipes page
