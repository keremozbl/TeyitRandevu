"use client";

import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { addMedicalNoteAction, type CustomerFormState } from "@/lib/customers/actions";

const EMPTY: CustomerFormState = {};

/**
 * Tıbbi not ekleme.
 *
 * Yetkiyi RLS verir (Kural 8): bu form yalnızca `customer.medical_notes.write`
 * izni olan kullanıcıya çizilir, ama asıl kapıyı politika tutuyor — formu
 * gizlemek yetki değildir.
 */
export function MedicalNoteForm({ customerId }: { customerId: string }) {
  const [state, formAction, pending] = useActionState(addMedicalNoteAction, EMPTY);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-2">
      <input type="hidden" name="customer_id" value={customerId} />
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <Field
        id="body"
        label="Yeni tıbbi not"
        hint="Bu not ayrı tabloda tutulur; resepsiyon rolü göremez."
      >
        <Textarea id="body" name="body" rows={3} maxLength={8000} required />
      </Field>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Ekleniyor…" : "Notu Ekle"}
        </Button>
      </div>
    </form>
  );
}
