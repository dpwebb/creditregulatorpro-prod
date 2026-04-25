import Stripe from "stripe";
import { OutputType } from "./stripe_POST.schema";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-03-31.basil",
});

export async function handle(request: Request) {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return new Response(
        JSON.stringify({ error: "STRIPE_WEBHOOK_SECRET is not set" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const rawBody = await request.text();

    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret
    );

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("Stripe webhook: checkout.session.completed", session.id);
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log("Stripe webhook: payment_intent.succeeded", paymentIntent.id);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log("Stripe webhook: invoice.paid", invoice.id);
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log("Stripe webhook:", event.type, subscription.id);
        break;
      }

      default:
        console.log("Stripe webhook: unhandled event", event.type);
    }

    return new Response(
      JSON.stringify({ received: true } satisfies OutputType),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Stripe webhook error:", error?.message || error);
    return new Response(
      JSON.stringify({ error: error?.message || "Webhook failed" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}






























































import Stripe from "stripe";
import { OutputType } from "./stripe_POST.schema";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-03-31.basil",
});

export async function handle(request: Request) {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return new Response(
        JSON.stringify({ error: "STRIPE_WEBHOOK_SECRET is not set" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const rawBody = await request.text();

    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret
    );

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("Stripe webhook: checkout.session.completed", session.id);
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log("Stripe webhook: payment_intent.succeeded", paymentIntent.id);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log("Stripe webhook: invoice.paid", invoice.id);
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log("Stripe webhook:", event.type, subscription.id);
        break;
      }

      default:
        console.log("Stripe webhook: unhandled event", event.type);
    }

    return new Response(
      JSON.stringify({ received: true } satisfies OutputType),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Stripe webhook error:", error?.message || error);
    return new Response(
      JSON.stringify({ error: error?.message || "Webhook failed" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}
