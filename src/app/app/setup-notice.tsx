import Link from "next/link";

/** Supabase bağlanmadan panele girilirse: boş ekran değil, ne yapılacağı. */
export function SetupNotice() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-6 py-20">
      <h1 className="text-xl tracking-tight">Supabase bağlantısı gerekiyor</h1>
      <p className="text-ink-2">
        Panel veriye erişemiyor çünkü ortam değişkenleri tanımlı değil. Kurulum
        adımları <span className="font-mono text-[13px]">README.md</span> içinde.
      </p>
      <ol className="flex flex-col gap-2 rounded border border-border bg-surface p-4 text-[13px] text-ink-2">
        <li>
          1. supabase.com&apos;da proje oluşturun — bölge{" "}
          <strong className="text-ink">Frankfurt (EU Central)</strong>
        </li>
        <li>
          2. Anahtarları <span className="font-mono">.env</span> dosyasına yazın
        </li>
        <li>
          3.{" "}
          <span className="font-mono">
            npx supabase login &amp;&amp; npm run db:link &amp;&amp; npm run db:push
          </span>
        </li>
      </ol>
      <Link href="/" className="text-[13px] text-accent underline underline-offset-2">
        Ana sayfaya dön
      </Link>
    </main>
  );
}
