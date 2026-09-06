"use client";

import { useState } from "react";
import { TermsAcceptanceCheckbox } from "@merqo/ui";
import { Button } from "@/components/ui/button";
import { acceptLegalTerms } from "./actions";

export function AcceptForm({ next }: { next: string }) {
  const [checked, setChecked] = useState(false);
  const [legalName, setLegalName] = useState("");

  return (
    <form action={acceptLegalTerms} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <TermsAcceptanceCheckbox
        checked={checked}
        onCheckedChange={setChecked}
        legalName={legalName}
        onLegalNameChange={setLegalName}
      />
      <Button
        type="submit"
        className="w-full"
        disabled={!checked || legalName.trim().length === 0}
      >
        Continue
      </Button>
    </form>
  );
}
