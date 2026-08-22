"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { signUp, type AuthState } from "@/lib/auth/actions";

const EMPTY: AuthState = {};

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, EMPTY);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl tracking-tight">Kurum hesabı oluşturun</h1>
        <p className="text-ink-2">
          Hesabı açtıktan sonra kurumunuzu kurar, sektörünüzü seçersiniz.
        </p>
      </div>

      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.notice && <Alert tone="success">{state.notice}</Alert>}

      <form action={action} className="flex flex-col gap-4">
        <Field id="full_name" label="Ad Soyad" required>
          <Input
            id="full_name"
            name="full_name"
            autoComplete="name"
            placeholder="Ayşe Demir"
            required
          />
        </Field>

        <Field id="email" label="E-posta" required>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            spellCheck={false}
            placeholder="ornek@klinik.com"
            required
          />
        </Field>

        <Field
          id="password"
          label="Parola"
          hint="En az 8 karakter."
          required
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>

        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Hesap oluşturuluyor…" : "Hesap Oluştur"}
        </Button>
      </form>

      <p className="border-t border-border pt-4 text-[13px] text-ink-2">
        Hesabınız var mı?{" "}
        <Link href="/giris" className="text-accent underline underline-offset-2">
          Giriş yapın
        </Link>
      </p>
    </div>
  );
}
