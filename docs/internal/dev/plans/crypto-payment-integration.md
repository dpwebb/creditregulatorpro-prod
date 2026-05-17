---
created: 2026-04-07T16:33:14.318Z
updated: 2026-04-07T16:33:14.318Z
---

# Cryptocurrency Payment Integration — BTC, LTC, XMR, USDT

## Summary

Add cryptocurrency payment support alongside the existing Stripe integration. Users will be able to pay for subscription plans (Monthly $29.95 CAD, Annual $199.95 CAD) and registered mail services using **Bitcoin (BTC)**, **Litecoin (LTC)**, **Monero (XMR)**, and **Tether (USDT)**.

The integration uses **NOWPayments** — a crypto payment gateway that supports all 4 requested currencies, offers a REST API with webhook (IPN) callbacks, and charges 0.5–1% per transaction.

---

## How It Works

### Payment Flow

1. **User selects "Pay with Crypto"** on the subscription upgrade dialog or registered mail payment dialog
2. **Backend creates a NOWPayments invoice** via `POST https://api.nowpayments.io/v1/payment` specifying the CAD amount, user-selected crypto currency (BTC/LTC/XMR/USDT), and our IPN webhook URL
3. **Frontend displays the payment details**: crypto address, amount to send, QR code, and a countdown timer (payments expire after ~20 min)
4. **User sends crypto** from their wallet
5. **NOWPayments sends IPN webhook** to our backend when payment status changes (`confirming` → `confirmed` → `finished`)
6. **Backend activates subscription** or processes mail delivery upon `finished` status, same as Stripe flow

### NOWPayments API Details

- **Base URL**: `https://api.nowpayments.io/v1/`
- **Auth**: `x-api-key` header
- **Create payment**: `POST /payment` — returns `pay_address`, `pay_amount`, `payment_id`, `payment_status`
- **Check status**: `GET /payment/{payment_id}` — returns current status
- **Webhook**: POST to our IPN callback URL — verify with `x-nowpayments-sig` header using HMAC-SHA-512 of sorted JSON body with IPN secret
- **Statuses**: `waiting` → `confirming` → `confirmed` → `sending` → `finished` (success) or `failed`/`expired`

---

## Database Changes

### New table: `crypto_payments`

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| user_id | integer NOT NULL FK → user_account | |
| nowpayments_id | bigint UNIQUE | NOWPayments payment ID |
| purpose | enum('subscription', 'registered_mail') | What the payment is for |
| plan | subscription_plan NULL | If purpose = subscription |
| packet_id | integer NULL FK → packet | If purpose = registered_mail |
| price_amount_cad | numeric NOT NULL | Amount in CAD |
| pay_currency | text NOT NULL | btc, ltc, xmr, usdt |
| pay_amount | numeric | Amount in crypto to pay |
| pay_address | text | Crypto address to send to |
| status | text NOT NULL DEFAULT 'waiting' | NOWPayments status |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz DEFAULT now() | |
| finished_at | timestamptz NULL | When payment completed |

### Modify `subscriptions` table

Add column:
- `crypto_payment_id` integer NULL FK → crypto_payments (to link crypto payments to subscriptions)

---

## New Resource / Secrets

### NOWPayments API Keys (GENERIC resource)
- `NOWPAYMENTS_API_KEY` — API key from NOWPayments dashboard
- `NOWPAYMENTS_IPN_SECRET` — IPN secret for webhook signature verification

---

## Files to Create

### Backend

1. **`helpers/nowpaymentsClient`** — Server-side NOWPayments API client
   - `createPayment(priceAmountCad, payCurrency, ipnCallbackUrl, orderId)` — creates a payment via NOWPayments API
   - `getPaymentStatus(paymentId)` — checks payment status
   - `verifyIpnSignature(body, signature)` — HMAC-SHA-512 verification of webhook
   - Supported currencies constant: `['btc', 'ltc', 'xmr', 'usdt']`

2. **`endpoints/crypto/create-payment_POST`** — Create a crypto payment
   - Input: `{ purpose: 'subscription' | 'registered_mail', plan?: 'monthly' | 'annual', packetId?: number, payCurrency: 'btc' | 'ltc' | 'xmr' | 'usdt' }`
   - Validates user has no pending crypto payment for same purpose
   - Calls NOWPayments API to create payment
   - Inserts row into `crypto_payments` table
   - Returns: `{ paymentId, payAddress, payAmount, payCurrency, expiresAt }`

3. **`endpoints/crypto/payment-status_GET`** — Check crypto payment status
   - Input: `{ paymentId: number }`
   - Fetches from `crypto_payments` table + optionally refreshes from NOWPayments API
   - Returns: `{ status, payAmount, payCurrency, payAddress }`

4. **`endpoints/crypto/webhook_POST`** — IPN webhook handler
   - Verifies `x-nowpayments-sig` header with HMAC-SHA-512
   - On `finished` status:
     - If purpose = `subscription`: activate the subscription (same logic as Stripe success path — update subscriptions table with plan, status = 'active', set period dates)
     - If purpose = `registered_mail`: trigger mail delivery (same logic as Stripe payment success for registered mail)
   - On `failed`/`expired`: update crypto_payments.status
   - Returns 200 OK

5. **`helpers/cryptoPaymentQueries`** — React Query hooks for crypto payments
   - `useCreateCryptoPayment()` — mutation
   - `useCryptoPaymentStatus(paymentId)` — query with polling (refetchInterval: 10s while status is 'waiting' or 'confirming')

### Frontend

6. **`components/CryptoPaymentDialog`** — Dialog showing crypto payment details
   - Shows: selected currency icon, pay amount, pay address (copyable), QR code (generated from pay address + amount), countdown timer
   - Polls payment status every 10 seconds
   - Shows status transitions: "Waiting for payment..." → "Confirming..." → "Payment confirmed!" → "Complete!"
   - Has a currency selector at the top to choose BTC/LTC/XMR/USDT before initiating
   - On success: calls onPaymentSuccess callback, invalidates subscription queries

7. **`components/CryptoPaymentOption`** — A card/button component for the payment method selector
   - Shows crypto currency icons (BTC, LTC, XMR, USDT) in a grid
   - User clicks one to initiate crypto payment flow
   - Used inside SubscriptionUpgradeDialog and StripePaymentDialog as an alternative

---

## Files to Modify

1. **`components/SubscriptionUpgradeDialog`** — Add a "Pay with Crypto" tab/toggle alongside the Stripe payment form
   - Before showing the Stripe Elements form, show a payment method selector: "Card" | "Crypto"
   - When "Crypto" is selected, show CryptoPaymentOption grid → user picks currency → opens CryptoPaymentDialog

2. **`components/SubscriptionSection`** — Add a note about crypto payment availability below the existing plan options

3. **`components/StripePaymentDialog`** (registered mail) — Add a "Pay with Crypto" alternative option alongside the Stripe form, following the same pattern as the subscription dialog

4. **`helpers/schema`** — Add crypto-related schema types if needed

---

## Approach

### Step 1: Database schema
- Create `crypto_payments` table
- Add `crypto_payment_id` column to `subscriptions`
- Pull schema

### Step 2: Request NOWPayments resource
- Request GENERIC resource for `NOWPAYMENTS_API_KEY` and `NOWPAYMENTS_IPN_SECRET`

### Step 3: Backend implementation
- Create `helpers/nowpaymentsClient`
- Create `endpoints/crypto/create-payment_POST`
- Create `endpoints/crypto/payment-status_GET`
- Create `endpoints/crypto/webhook_POST`
- Create `helpers/cryptoPaymentQueries`

### Step 4: Frontend components
- Create `components/CryptoPaymentOption`
- Create `components/CryptoPaymentDialog`

### Step 5: Integration
- Modify `SubscriptionUpgradeDialog` to add crypto payment tab
- Modify `StripePaymentDialog` to add crypto payment option
- Update `SubscriptionSection` with crypto note

---

## Risks & Considerations

- **Price volatility**: NOWPayments handles the conversion from CAD to crypto at the time of payment creation. The user has a limited window (~20 min) to complete the payment at the quoted rate.
- **Confirmation times**: BTC can take 10–60 min for confirmations. LTC is faster (~2.5 min). XMR ~2 min. USDT (ERC-20) ~5 min. The UI should clearly communicate expected wait times per currency.
- **Monero privacy**: XMR transactions are private by default. NOWPayments handles XMR payments and tracking, so no special handling is needed on our side.
- **Backward compatibility**: This is purely additive — no existing Stripe flows are modified, only extended with an additional payment method option.
- **Webhook security**: The IPN webhook MUST verify the HMAC-SHA-512 signature to prevent spoofed payment confirmations.
- **Duplicate payments**: The create-payment endpoint must check for existing pending crypto payments for the same user+purpose to prevent duplicate invoices.
- **QR code generation**: Use a simple client-side QR code library (e.g., `qrcode` npm package) to generate QR codes for the payment address. For BTC/LTC, use BIP21 URI format (`bitcoin:address?amount=X`). For XMR, use `monero:address?tx_amount=X`. For USDT, just the address.
- **No recurring crypto billing**: Unlike Stripe subscriptions, crypto payments are one-time. For subscription renewals, users will need to manually pay again when their period expires. The system should send email reminders before expiry.
