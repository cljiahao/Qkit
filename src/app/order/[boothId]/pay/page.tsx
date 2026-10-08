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
  if (context.state === "cancelled") {
    return (
      <div className="mx-auto max-w-sm space-y-4 px-5 py-10 text-center">
        <h1 className="font-display text-2xl font-semibold">
          This order was cancelled
        </h1>
        <p className="text-sm text-muted-foreground">
          Please do not make a payment for this order.
        </p>
        <Link
          href={`/order/${boothId}`}
          className="text-sm font-medium text-primary underline"
        >
          Order again from this stall
        </Link>
      </div>
    );
  }

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
