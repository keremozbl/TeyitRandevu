import type { Metadata } from "next";

import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Kayıt" };

export default function KayitPage() {
  return <SignUpForm />;
}
