import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { orderBoothIdSchema, orderTokenSchema } from "@/lib/schemas";
import { loadPreClaimContext } from "../[orderNumber]/payment-actions";
import { PayForm } from "./pay-form";

interface Props {
  params: Promise<{ boothId: string }>;
  searchParams: Promise<{ t?: string }>;
}

export const revalidate = 0;

// An order that can no longer be paid for. Says so, and above all says not
// to pay: the QR for it may still be on the customer's screen or in their
// photos.
function ClosedOrder({
  boothId,
  title,
  detail,
}: {
  boothId: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="mx-auto max-w-sm space-y-4 px-5 py-10 text-center">
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{detail}</p>
      <Link
        href={`/order/${boothId}`}
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline"
      >
        Order again from this stall
      </Link>
    </div>
  );
}

/**
 * Payment-first gate shown while a payment-required order still has no
 * order_number (deferred until a successful claim — see claimPayment in
 * ../[orderNumber]/payment-actions.ts). Reached from OrderForm's redirect
 * when placeOrder returns a null orderNumber.
 */
export default async function PayPage({ params, searchParams }: Props) {
  const { boothId } = await params;
  const { t: token } = await searchParams;

  if (
    !orderBoothIdSchema.safeParse(boothId).success ||
    !token ||
    !orderTokenSchema.safeParse(token).success
  )
    notFound();

  const context = await loadPreClaimContext(boothId, token);
  if (!context) notFound();
  if (context.state === "placed")
    redirect(`/order/${boothId}/${context.orderNumber}?t=${token}`);
  if (context.state === "cancelled")
    return (
      <ClosedOrder
        boothId={boothId}
        title="This order was cancelled"
        detail="Please do not make a payment for this order."
      />
    );
  if (context.state === "expired")
    return (
      <ClosedOrder
        boothId={boothId}
        title="This order has expired"
        detail="It was not paid in time, so the stall is not making it. Please do not pay for it."
      />
    );

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col px-5 py-10">
      <PayForm
        boothId={boothId}
        token={token}
        amountCents={context.amountCents}
        checkout={context.checkout}
      />
    </div>
  );
}
