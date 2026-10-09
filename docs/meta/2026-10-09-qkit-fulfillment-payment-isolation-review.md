# Fulfillment and payment isolation, October 9

The fresh action-test review reproduced an incorrect payment mirror transition.
Vendor pickup completed an order and wrote `payment_status = confirmed` and
`paid_at` without calling Paykit. Its undo could clear that payment record,
including a genuine confirmation made by another action during the undo window.
The card also displayed optimistic Paid status after pickup.

Fulfillment advancement now writes only status and fulfillment timestamps.
Fulfillment undo clears only its transition timestamp and restores its status.
The previous-payment argument remains validated for existing action callers but
does not authorize a financial write. The card sets its optimistic paid flag
only after the explicit Paykit-backed confirmation succeeds. Completed unpaid
orders expose that confirmation action, including proof review; cancelled orders
do not. Pickup remains available during an upstream payment outage and retains
the unpaid record for settlement.

This agrees with the project's existing customer-collection rule and Paykit's
ownership of transaction state. As an architectural reference, [Stripe's
payment status guidance](https://docs.stripe.com/payments/payment-intents/verifying-status)
uses the authoritative payment state to distinguish pending and successful
payments. Qkit uses manually confirmed Paykit transactions, not Stripe; pickup
itself is evidence of fulfillment, not of that transaction's confirmation.

Four focused suites pass 195 tests. New cases reproduce outstanding-payment
pickup, undo after concurrent confirmation, completed-order settlement and a
failed confirmation that remains unpaid and retryable. Exact patch assertions
prevent payment fields from reappearing. An independent agent reviewed the
three production diffs and checked the completed-order settlement affordance.
Strict types, whole lint and formatting pass. The latest curated secret-free
webpack build passes after this production change. Final full coverage passes
1,935 tests with 84.62% statements, 81.14% branches, 81.47% functions and 85.84%
lines; two opt-in database tests remain skipped. Mocked regressions
do not verify live Paykit integration or database policy behavior.
