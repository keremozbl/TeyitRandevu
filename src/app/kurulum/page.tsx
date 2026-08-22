import type { Metadata } from "next";

import { SetupNotice } from "@/app/app/setup-notice";
import { requireUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { listTemplates } from "@/lib/templates";

import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = { title: "Kurulum" };

export default async function KurulumPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  await requireUser();
  return <OnboardingWizard templates={listTemplates()} />;
}
