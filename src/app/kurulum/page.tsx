import type { Metadata } from "next";

import { SetupNotice } from "@/app/app/setup-notice";
import { requireUser } from "@/lib/auth/session";
import { isDemoUser } from "@/lib/demo/config";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { listTemplates } from "@/lib/templates";

import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = { title: "Kurulum" };

export default async function KurulumPage({
  searchParams,
}: {
  searchParams: Promise<{ sektor?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { user } = await requireUser();
  const { sektor } = await searchParams;
  const templates = listTemplates();

  return (
    <OnboardingWizard
      templates={templates}
      initialTemplate={templates.some((t) => t.key === sektor) ? sektor : undefined}
      demo={isDemoUser(user)}
    />
  );
}
