import Stripe from "stripe";
import { OutputType } from "./stripe_POST.schema";
import { logger } from "../../helpers/logger";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
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
        logger.info("Stripe webhook event", { type: event.type, sessionId: session.id });
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        logger.info("Stripe webhook event", { type: event.type, paymentIntentId: paymentIntent.id });
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        logger.info("Stripe webhook event", { type: event.type, invoiceId: invoice.id });
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        logger.info("Stripe webhook event", { type: event.type, subscriptionId: subscription.id });
        break;
      }

      default:
        logger.debug("Stripe webhook unhandled event", { type: event.type });
    }

    return new Response(
      JSON.stringify({ received: true } satisfies OutputType),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    logger.error("Stripe webhook error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response(
      JSON.stringify({ error: error?.message || "Webhook failed" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}
