export type TransUnionPaymentAmountFrequency = {
  amount: number;
  frequency: string;
  raw: string;
};

export type PaymentTermsTarget = {
  terms?: string | null;
  monthlyPayment?: number | null;
  scheduledMonthlyPayment?: number | null;
  paymentFrequency?: string | null;
};

export function parseTransUnionPaymentAmountFrequency(
  value: unknown,
): TransUnionPaymentAmountFrequency | null {
  if (value == null) return null;

  const raw = String(value).replace(/\s+/g, " ").trim();
  const match = raw.match(/^\$?\s*([0-9][0-9,]*(?:\.\d+)?)\s*\/\s*([A-Za-z]+)\s*$/);
  if (!match) return null;

  const amount = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount < 0) return null;

  return {
    amount,
    frequency: match[2].toUpperCase(),
    raw,
  };
}

export function isSamePaymentAmount(value: unknown, amount: number): boolean {
  if (value == null) return false;

  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[^0-9.-]/g, ""));

  return Number.isFinite(parsed) && Math.abs(parsed - amount) < 0.005;
}

export function normalizeTransUnionPaymentTerms<T extends PaymentTermsTarget>(
  target: T,
): T {
  const paymentTerms = parseTransUnionPaymentAmountFrequency(target.terms);
  if (!paymentTerms) return target;

  return {
    ...target,
    terms: null,
    monthlyPayment: target.monthlyPayment ?? paymentTerms.amount,
    scheduledMonthlyPayment: target.scheduledMonthlyPayment ?? paymentTerms.amount,
    paymentFrequency: target.paymentFrequency ?? paymentTerms.frequency,
  };
}
