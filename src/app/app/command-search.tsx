"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { searchCustomersAction } from "@/lib/customers/search-actions";
import type { CustomerHit } from "@/lib/customers/queries";
import { formatPhoneTr } from "@/lib/utils/phone";

import { Icon, navFlat, type NavItem } from "./nav-items";

/**
 * Panelin her yerinden çalışan arama — ⌘K / Ctrl+K.
 *
 * Neden var: resepsiyon gün boyu "şu hasta hangi saatteydi" sorusunu
 * cevaplıyor ve bunun için önce menüden hastalara, sonra arama kutusuna
 * gidiyordu. İki tıkı sıfıra indiriyor.
 *
 * Üç karar:
 *
 * 1. **Tetikleyici gerçek bir bağlantı.** JavaScript çalışmazsa hasta listesine
 *    gider; çalışıyorsa tıklama yakalanıp kutu açılır. Cmd/Ctrl+tık her iki
 *    durumda da yeni sekmede açar.
 * 2. **Dokunmatikte kutu hiç açılmaz.** Küçük ekranda bir modalın içine sanal
 *    klavye açmak yerine hasta listesine gitmek daha hızlı; `autoFocus` da
 *    mobilde tavsiye edilmiyor.
 * 3. **Sonuçlar server action'dan.** Yeni bir API ucu yok, kurum kimliği
 *    istemciden gelmiyor, RLS geçerli (bkz. search-actions.ts).
 */
export function CommandSearch({
  customers,
  services,
  customersLabel,
}: {
  customers: string;
  services: string;
  /** "Hasta ara…" — kurumun kendi terimi */
  customersLabel: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [index, setIndex] = useState(0);

  /**
   * Sonuç, ait olduğu aramayla birlikte tutuluyor.
   *
   * Ayrı bir `loading` bayrağı yerine bu: "yükleniyor" zaten türetilebilir bir
   * durum (yazılan terim ile elimizdeki sonucun terimi farklıysa arama sürüyor)
   * ve yavaş dönen eski bir isteğin yeni sonucu ezmesi de böyle imkânsız.
   */
  const [result, setResult] = useState<{ term: string; hits: CustomerHit[] }>({
    term: "",
    hits: [],
  });

  const value = term.trim();
  const aranmali = value.length >= 2;
  const loading = aranmali && result.term !== value;
  const hits = aranmali && result.term === value ? result.hits : [];

  const pages = navFlat(customers, services);
  const query = value.toLocaleLowerCase("tr-TR");
  const pageHits: NavItem[] =
    query.length === 0
      ? pages
      : pages.filter((item) => item.label.toLocaleLowerCase("tr-TR").includes(query));

  // Ok tuşları iki bölümü tek liste gibi dolaşsın
  const options = [
    ...pageHits.map((item) => ({ key: `s:${item.href}`, href: item.href, label: item.label })),
    ...hits.map((hit) => ({
      key: `h:${hit.id}`,
      href: `/app/hastalar/${hit.id}`,
      label: hit.fullName,
    })),
  ];

  /* Seçili satır render sırasında sınırlanıyor, `useEffect` ile düzeltilmiyor:
     liste her tuş vuruşunda kısalıyor ve efektle düzeltmek bir kare boyunca
     var olmayan satırı seçili göstermek demek. */
  const secim = options.length === 0 ? -1 : Math.min(index, options.length - 1);

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  /**
   * Açılış `toggle` olayına bağlanmıyor: `<dialog>` üzerindeki o olay ancak
   * yakın tarayıcı sürümlerinde var ve gelmeyen bir olay kutuyu görünür ama
   * ölü bırakırdı. Kapanışta kullanılan `close` olayı ise baştan beri var.
   */
  const ac = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    setOpen(true);
    inputRef.current?.focus();
  }, []);

  /* --- açma: ⌘K / Ctrl+K ------------------------------------------------- */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      if (dialogRef.current?.open) close();
      else ac();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ac, close]);

  /* --- arama: 200 ms bekle ------------------------------------------------ */
  useEffect(() => {
    if (!open || !aranmali) return;

    let iptal = false;
    const zamanlayici = window.setTimeout(async () => {
      try {
        const hits = await searchCustomersAction(value);
        if (!iptal) setResult({ term: value, hits });
      } catch {
        // Arama kutusu hata ekranı açmaz: boş sonuç "sonuç yok" gösterir.
        if (!iptal) setResult({ term: value, hits: [] });
      }
    }, 200);

    return () => {
      iptal = true;
      window.clearTimeout(zamanlayici);
    };
  }, [value, aranmali, open]);

  function git(href: string) {
    close();
    router.push(href);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (options.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((secim + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((secim - 1 + options.length) % options.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setIndex(options.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const secili = options[secim];
      if (secili) git(secili.href);
    }
  }

  const aktifId = options[secim] ? `${listId}-${options[secim].key}` : undefined;

  return (
    <>
      {/* Tetikleyici: görünüşü arama kutusu, davranışı bağlantı */}
      <Link
        href="/app/hastalar"
        onClick={(event) => {
          // Yeni sekmede açmak isteyene karışma
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          // Dokunmatikte modal yerine liste sayfası
          if (window.matchMedia("(pointer: coarse)").matches) return;
          event.preventDefault();
          ac();
        }}
        className="hidden h-7 min-w-0 items-center gap-2 rounded border border-border bg-surface px-2 text-[13px] text-ink-3 no-underline transition-colors duration-150 hover:border-border-strong hover:text-ink-2 md:flex md:w-56"
      >
        <svg
          viewBox="0 0 16 16"
          className="size-3.5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="7.25" cy="7.25" r="4.25" />
          <path d="m10.5 10.5 3 3" />
        </svg>
        <span className="min-w-0 flex-1 truncate text-left">Ara</span>
        <kbd
          aria-hidden="true"
          className="shrink-0 rounded border border-border bg-surface-2 px-1 font-mono text-[10px] text-ink-3"
        >
          ⌘&nbsp;K
        </kbd>
      </Link>

      <dialog
        ref={dialogRef}
        aria-label="Panelde ara"
        onClose={() => {
          setOpen(false);
          setTerm("");
          setResult({ term: "", hits: [] });
          setIndex(0);
        }}
        // Zemine tıklayınca kapansın — <dialog> bunu kendi yapmıyor
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
        className="m-0 mx-auto mt-[12vh] w-[min(560px,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-0 text-ink shadow-[0_24px_60px_-30px_rgba(0,0,0,0.55)] backdrop:bg-[rgb(0_0_0/0.4)]"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <svg
            viewBox="0 0 16 16"
            className="size-4 shrink-0 text-ink-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="7.25" cy="7.25" r="4.25" />
            <path d="m10.5 10.5 3 3" />
          </svg>

          <label htmlFor={`${listId}-giris`} className="sr-only">
            {customersLabel} veya sayfa ara
          </label>
          <input
            ref={inputRef}
            id={`${listId}-giris`}
            type="search"
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder={`${customersLabel} adı, telefon ya da sayfa…`}
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={aktifId}
            className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
          />
        </div>

        <div className="max-h-[min(60vh,26rem)] overflow-y-auto overscroll-contain p-1.5">
          {options.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-[13px] text-ink-2">
              {loading
                ? "Aranıyor…"
                : term.trim().length < 2
                  ? "Aramak için en az iki harf yazın."
                  : `“${term.trim()}” için sonuç yok. Adın yazılışını ya da telefonun son dört hanesini deneyin.`}
            </p>
          ) : (
            <ul id={listId} role="listbox" aria-label="Arama sonuçları" className="flex flex-col">
              {pageHits.length > 0 && (
                <li
                  role="presentation"
                  className="px-2.5 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3"
                >
                  Sayfalar
                </li>
              )}
              {pageHits.map((item, i) => (
                <Option
                  key={item.href}
                  id={`${listId}-s:${item.href}`}
                  active={secim === i}
                  href={item.href}
                  onHover={() => setIndex(i)}
                  onPick={git}
                >
                  <Icon>{item.icon}</Icon>
                  <span className="min-w-0 truncate">{item.label}</span>
                </Option>
              ))}

              {hits.length > 0 && (
                <li
                  role="presentation"
                  className="px-2.5 pb-1 pt-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3"
                >
                  {customers}
                </li>
              )}
              {hits.map((hit, i) => {
                const pos = pageHits.length + i;
                return (
                  <Option
                    key={hit.id}
                    id={`${listId}-h:${hit.id}`}
                    active={secim === pos}
                    href={`/app/hastalar/${hit.id}`}
                    onHover={() => setIndex(pos)}
                    onPick={git}
                  >
                    <span className="min-w-0 flex-1 truncate">{hit.fullName}</span>
                    {hit.phone && (
                      <span data-numeric className="shrink-0 font-mono text-[11px] text-ink-3">
                        {formatPhoneTr(hit.phone)}
                      </span>
                    )}
                  </Option>
                );
              })}
            </ul>
          )}
        </div>

        {/* Sonuç sayısı sessizce değişmesin */}
        <p aria-live="polite" className="sr-only">
          {loading ? "Aranıyor…" : `${options.length} sonuç`}
        </p>

        <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
          <span>↑↓ gez</span>
          <span>↵ aç</span>
          <span>esc kapat</span>
        </div>
      </dialog>
    </>
  );
}

/**
 * Tek sonuç satırı.
 *
 * `<a>`, `<div onClick>` değil: Cmd/Ctrl+tık yeni sekmede açsın ve bağlantı
 * durum çubuğunda görünsün. Klavye yolu girişte (`aria-activedescendant`), bu
 * yüzden satırlar sekme sırasının dışında.
 */
function Option({
  id,
  href,
  active,
  onHover,
  onPick,
  children,
}: {
  id: string;
  href: string;
  active: boolean;
  onHover: () => void;
  onPick: (href: string) => void;
  children: React.ReactNode;
}) {
  return (
    <li role="presentation">
      <Link
        id={id}
        href={href}
        role="option"
        aria-selected={active}
        tabIndex={-1}
        onMouseMove={onHover}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          onPick(href);
        }}
        className={`flex items-center gap-2.5 rounded px-2.5 py-1.5 text-[13px] no-underline transition-colors duration-150 ${
          active ? "bg-accent-soft text-ink" : "text-ink-2"
        }`}
      >
        {children}
      </Link>
    </li>
  );
}
