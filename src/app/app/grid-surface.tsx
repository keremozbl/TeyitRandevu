"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { Alert } from "@/components/ui/alert";
import { moveAppointmentAction } from "@/lib/appointments/edit-actions";
import {
  draggedStart,
  isMoved,
  pixelsToMinutes,
  resizedDuration,
  type GridBounds,
} from "@/lib/scheduling/drag";

/**
 * Izgaranın etkileşim katmanı: sürükleyerek taşıma ve alt kenardan uzatma.
 *
 * Sütunlar, boş slotlar ve zaman ekseni sunucuda çizilir; burası yalnızca
 * randevu bloklarının **geçici konumunu** tutar. Geçici konum iki durumda
 * doğar: parmağın altında sürüklenirken ve bırakıldıktan sonra sunucu
 * onaylayana kadar. İkincisi olmadan her taşıma yarım saniyelik bir donma gibi
 * hissediliyordu — blok önce eski yerine dönüyor, sonra yeni yerinde beliriyordu.
 *
 * Depo `Map<id, Draft>` ve abonelik blok başına: elli randevulu bir günde
 * sürüklerken tek bir bileşen yeniden çizilir, ızgaranın tamamı değil.
 *
 * Erişilebilirlik: sürükleme tek yol değil. Blok bir bağlantı — Enter düzenleme
 * formunu açar, saat ve süre orada yazılır. Alt kenardaki tutamak gerçek bir
 * buton: odaklanıp yukarı/aşağı okla süre değişir, el kalkınca kaydedilir.
 *
 * Dokunmatik bilerek dışarıda: ızgara dikey kayan bir yüzey, parmakla sürükleme
 * ile kaydırma aynı hareketi paylaşır. Tablette düzenleme formu kullanılır.
 */

/** Sürükleme sayılması için gereken piksel — titremeyi tıklamadan ayırır. */
const DRAG_THRESHOLD_PX = 3;

/** Kenara bu kadar yaklaşınca ızgara kendiliğinden kayar. */
const AUTO_SCROLL_EDGE_PX = 36;
const AUTO_SCROLL_MAX_PX = 14;

/** Klavyeyle süre değiştirirken her tuşta istek atılmaz; el kalkınca gönderilir. */
const KEY_COMMIT_DELAY_MS = 700;

/** Yapışkan sütun başlığının yüksekliği — kendiliğinden kaymanın üst sınırı. */
const HEADER_H = 40;

/** Bir bloğun geçici konumu. Sunucu onaylayınca blok bunu kendisi siler. */
export type Draft = {
  startMinutes: number;
  durationMinutes: number;
  resourceId: string;
  /** Başka sütuna taşınırken yatay kayma, piksel */
  offsetX: number;
  dragging: boolean;
  pending: boolean;
};

/** Bloğun kendi bildiği güncel değerler; sürükleme bunlardan başlar. */
export type BlockInfo = {
  id: string;
  resourceId: string;
  startMinutes: number;
  durationMinutes: number;
  name: string;
};

type GridApi = {
  bounds: GridBounds;
  pxPerMinute: number;
  dayStartsAtMs: number;
  formatTime: (minutes: number) => string;
  subscribe: (id: string, listener: () => void) => () => void;
  read: (id: string) => Draft | null;
  clear: (id: string) => void;
  begin: (event: ReactPointerEvent<HTMLElement>, info: BlockInfo) => void;
  resizeByKey: (event: ReactKeyboardEvent<HTMLElement>, info: BlockInfo) => void;
  /**
   * "Sürüklendi ama yerinden oynamadı" — yani kullanıcı aslında tıkladı.
   *
   * Bu sinyale ihtiyaç var çünkü tarayıcının `click` olayı o durumda bloğa
   * ulaşmıyor: sürükleme başlar başlamaz blok `pointer-events: none` oluyor
   * (altındaki sütun bulunabilsin diye) ve fare kalktığında tıklamanın hedefi
   * artık blok değil. Titrek bir tıklamayı kaybetmemek için ızgara, tıklamayı
   * doğrudan bloğa haber veriyor.
   */
  registerTap: (id: string, handler: () => void) => () => void;
};

const GridContext = createContext<GridApi | null>(null);

export function useGrid(): GridApi {
  const api = useContext(GridContext);
  if (!api) throw new Error("AppointmentBlock yalnızca GridSurface içinde çizilir.");
  return api;
}

type Drag = {
  kind: "move" | "resize";
  pointerId: number;
  info: BlockInfo;
  originColumn: HTMLElement;
  column: HTMLElement;
  /** Basma anındaki dikey konum — kaydırma dahil, içerik koordinatında */
  originY: number;
  pointerX: number;
  pointerY: number;
  /** Eşik aşıldı mı; aşılmadıysa bu bir tıklamadır */
  active: boolean;
  draft: Draft;
};

type KeyResize = { info: BlockInfo; next: number; timer: ReturnType<typeof setTimeout> | null };

export function GridSurface({
  label,
  timeZone,
  dayStartsAtMs,
  pxPerMinute,
  gridFromMinutes,
  gridToMinutes,
  stepMinutes,
  children,
}: {
  /** Izgaranın ekran okuyucudaki adı */
  label: string;
  timeZone: string;
  dayStartsAtMs: number;
  pxPerMinute: number;
  gridFromMinutes: number;
  gridToMinutes: number;
  /** Sürüklemenin oturduğu adım; `booking_rules.slot_step_minutes` */
  stepMinutes: number;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const keyRef = useRef<KeyResize | null>(null);
  const suppressClickRef = useRef(false);
  /** Blokların "tıklandım" dinleyicileri — bkz. GridApi.registerTap */
  const tapHandlersRef = useRef(new Map<string, () => void>());
  const scrollFrameRef = useRef<number | null>(null);

  const draftsRef = useRef(new Map<string, Draft>());
  const listenersRef = useRef(new Map<string, Set<() => void>>());

  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState("");
  const [, startTransition] = useTransition();

  const bounds = useMemo<GridBounds>(
    () => ({ fromMinutes: gridFromMinutes, toMinutes: gridToMinutes, stepMinutes }),
    [gridFromMinutes, gridToMinutes, stepMinutes],
  );

  const time = useMemo(
    () =>
      new Intl.DateTimeFormat("tr-TR", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
    [timeZone],
  );

  const formatTime = useCallback(
    (minutes: number) => time.format(new Date(dayStartsAtMs + minutes * 60_000)),
    [time, dayStartsAtMs],
  );

  const subscribe = useCallback((id: string, listener: () => void) => {
    const listeners = listenersRef.current;
    const set = listeners.get(id) ?? new Set<() => void>();
    set.add(listener);
    listeners.set(id, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) listeners.delete(id);
    };
  }, []);

  const read = useCallback((id: string) => draftsRef.current.get(id) ?? null, []);

  /** Depoyu günceller ve yalnızca o bloğun abonelerini uyandırır. */
  const publish = useCallback((id: string, draft: Draft | null) => {
    const drafts = draftsRef.current;
    const current = drafts.get(id) ?? null;
    if (
      current &&
      draft &&
      current.startMinutes === draft.startMinutes &&
      current.durationMinutes === draft.durationMinutes &&
      current.resourceId === draft.resourceId &&
      current.offsetX === draft.offsetX &&
      current.dragging === draft.dragging &&
      current.pending === draft.pending
    ) {
      return; // değişen bir şey yok, boşuna çizme
    }
    if (draft) drafts.set(id, draft);
    else if (!drafts.delete(id)) return;
    for (const listener of listenersRef.current.get(id) ?? []) listener();
  }, []);

  const clear = useCallback((id: string) => publish(id, null), [publish]);

  const stopAutoScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  }, []);

  const clearDropMark = useCallback(() => {
    for (const marked of document.querySelectorAll<HTMLElement>("[data-drop='true']")) {
      marked.removeAttribute("data-drop");
    }
  }, []);

  /**
   * Sürüklemenin ardından gelen tıklamayı yutar.
   *
   * Bayrak yalnız bir sonraki olay döngüsüne kadar yaşar: sürükleme blokların
   * dışında bittiğinde `click` hiç gelmez ve asılı kalan bayrak sonraki
   * tıklamayı — boş slota basmayı — sessizce yerdi.
   */
  const suppressNextClick = useCallback(() => {
    suppressClickRef.current = true;
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }, []);

  /** Sürüklemenin bittiği her yol buradan geçer. */
  const releaseDrag = useCallback(() => {
    dragRef.current = null;
    stopAutoScroll();
    clearDropMark();
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  }, [clearDropMark, stopAutoScroll]);

  /** Sunucuya yazar; blok o sırada yeni yerinde bekler. */
  const commit = useCallback(
    (info: BlockInfo, draft: Draft) => {
      setError(null);
      setLive(`${info.name} kaydediliyor…`);
      publish(info.id, { ...draft, dragging: false, pending: true });

      startTransition(async () => {
        const result = await moveAppointmentAction({
          id: info.id,
          resource_id: draft.resourceId,
          starts_at: new Date(dayStartsAtMs + draft.startMinutes * 60_000).toISOString(),
          duration_min: draft.durationMinutes,
        });

        if (result.ok) {
          // Taslak duruyor: sunucudan gelen yeni değer bloğa ulaşınca blok
          // ikisinin aynı olduğunu görüp taslağı kendisi siler.
          publish(info.id, { ...draft, dragging: false, pending: false });
          setLive(
            `${info.name} · ${formatTime(draft.startMinutes)} · ${draft.durationMinutes} dakika · kaydedildi.`,
          );
        } else {
          publish(info.id, null);
          setError(result.error);
          setLive("");
        }
      });
    },
    [dayStartsAtMs, formatTime, publish],
  );

  /** Fare konumundan yeni yeri hesaplar ve bloğu oraya taşır. */
  const track = useCallback(() => {
    const drag = dragRef.current;
    const scroller = scrollerRef.current;
    if (!drag || !scroller) return;

    const view = scroller.getBoundingClientRect();
    const contentY = drag.pointerY - view.top + scroller.scrollTop;
    const deltaMinutes = pixelsToMinutes(contentY - drag.originY, pxPerMinute);
    const { info } = drag;

    if (drag.kind === "move") {
      const under = document
        .elementFromPoint(drag.pointerX, drag.pointerY)
        ?.closest<HTMLElement>("[data-column]");
      if (under && under !== drag.column) {
        drag.column.removeAttribute("data-drop");
        drag.column = under;
      }
      if (drag.column !== drag.originColumn) drag.column.setAttribute("data-drop", "true");

      drag.draft = {
        startMinutes: draggedStart({
          startMinutes: info.startMinutes,
          durationMinutes: info.durationMinutes,
          deltaMinutes,
          bounds,
        }),
        durationMinutes: info.durationMinutes,
        resourceId: drag.column.dataset.resourceId ?? info.resourceId,
        offsetX:
          drag.column.getBoundingClientRect().left - drag.originColumn.getBoundingClientRect().left,
        dragging: true,
        pending: false,
      };
    } else {
      drag.draft = {
        startMinutes: info.startMinutes,
        durationMinutes: resizedDuration({
          startMinutes: info.startMinutes,
          durationMinutes: info.durationMinutes,
          deltaMinutes,
          bounds,
        }),
        resourceId: info.resourceId,
        offsetX: 0,
        dragging: true,
        pending: false,
      };
    }

    publish(info.id, drag.draft);
  }, [bounds, publish, pxPerMinute]);

  /** Kenara yaklaşınca ızgarayı kaydırır; hız kenara olan uzaklıkla artar. */
  const startAutoScroll = useCallback(() => {
    function frame() {
      const drag = dragRef.current;
      const scroller = scrollerRef.current;
      if (!drag || !scroller) {
        stopAutoScroll();
        return;
      }

      const view = scroller.getBoundingClientRect();
      const topEdge = view.top + HEADER_H + AUTO_SCROLL_EDGE_PX;
      const bottomEdge = view.bottom - AUTO_SCROLL_EDGE_PX;

      let step = 0;
      if (drag.pointerY < topEdge) {
        step = -Math.min(AUTO_SCROLL_MAX_PX, (topEdge - drag.pointerY) / 3);
      } else if (drag.pointerY > bottomEdge) {
        step = Math.min(AUTO_SCROLL_MAX_PX, (drag.pointerY - bottomEdge) / 3);
      }

      if (step === 0) {
        stopAutoScroll();
        return;
      }

      scroller.scrollTop += step;
      track();
      scrollFrameRef.current = requestAnimationFrame(frame);
    }

    if (scrollFrameRef.current === null) scrollFrameRef.current = requestAnimationFrame(frame);
  }, [stopAutoScroll, track]);

  const begin = useCallback((event: ReactPointerEvent<HTMLElement>, info: BlockInfo) => {
    if (event.button !== 0 || event.pointerType === "touch" || dragRef.current) return;

    const column = event.currentTarget.closest<HTMLElement>("[data-column]");
    const scroller = scrollerRef.current;
    if (!column || !scroller) return;

    const view = scroller.getBoundingClientRect();
    dragRef.current = {
      kind: (event.target as HTMLElement).closest("[data-resize-handle]") ? "resize" : "move",
      pointerId: event.pointerId,
      info,
      originColumn: column,
      column,
      originY: event.clientY - view.top + scroller.scrollTop,
      pointerX: event.clientX,
      pointerY: event.clientY,
      active: false,
      draft: {
        startMinutes: info.startMinutes,
        durationMinutes: info.durationMinutes,
        resourceId: info.resourceId,
        offsetX: 0,
        dragging: false,
        pending: false,
      },
    };

    // Yakalama olmadan da çalışır: olaylar zaten yüzeye kadar kabarır. Bazı
    // tarayıcılar etkin olmayan bir pointer için hata attığı için sarmalanıyor.
    try {
      rootRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // yakalanamadı; sürükleme yine de sürer
    }
  }, []);

  const flushKeyResize = useCallback(() => {
    const pending = keyRef.current;
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    keyRef.current = null;
    if (pending.next === pending.info.durationMinutes) {
      publish(pending.info.id, null);
      return;
    }
    commit(pending.info, {
      startMinutes: pending.info.startMinutes,
      durationMinutes: pending.next,
      resourceId: pending.info.resourceId,
      offsetX: 0,
      dragging: false,
      pending: false,
    });
  }, [commit, publish]);

  const cancelKeyResize = useCallback(() => {
    const pending = keyRef.current;
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    keyRef.current = null;
    publish(pending.info.id, null);
  }, [publish]);

  /** Klavyeyle süre değiştirme — tutamak gerçek bir buton olduğu için gerekli. */
  const resizeByKey = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>, info: BlockInfo) => {
      if (event.key === "Escape") {
        cancelKeyResize();
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        flushKeyResize();
        return;
      }
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;

      // Izgaranın ok tuşlarıyla kayması süre değiştirmenin önüne geçmesin
      event.preventDefault();

      const started = keyRef.current?.info.id === info.id ? keyRef.current : null;
      if (started?.timer) clearTimeout(started.timer);
      const base = started ?? { info, next: info.durationMinutes, timer: null };

      const next = resizedDuration({
        startMinutes: base.info.startMinutes,
        durationMinutes: base.next,
        deltaMinutes: event.key === "ArrowDown" ? stepMinutes : -stepMinutes,
        bounds,
      });

      keyRef.current = {
        info: base.info,
        next,
        timer: setTimeout(flushKeyResize, KEY_COMMIT_DELAY_MS),
      };
      publish(base.info.id, {
        startMinutes: base.info.startMinutes,
        durationMinutes: next,
        resourceId: base.info.resourceId,
        offsetX: 0,
        dragging: false,
        pending: false,
      });
    },
    [bounds, cancelKeyResize, flushKeyResize, publish, stepMinutes],
  );

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;

    if (!drag.active) {
      const far =
        Math.abs(event.clientY - drag.pointerY) > DRAG_THRESHOLD_PX ||
        Math.abs(event.clientX - drag.pointerX) > DRAG_THRESHOLD_PX;
      if (!far) return;

      drag.active = true;
      document.body.style.cursor = drag.kind === "resize" ? "ns-resize" : "grabbing";
      document.body.style.userSelect = "none";
      cancelKeyResize();
    }

    drag.pointerX = event.clientX;
    drag.pointerY = event.clientY;
    track();
    startAutoScroll();
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const { active, info, draft } = drag;

    releaseDrag();

    /**
     * Eşik aşılmadıysa bu bir tıklamadır ve kutuyu doğrudan buradan açıyoruz.
     *
     * Tarayıcının `click` olayına güvenilmiyor: basma ile bırakma farklı
     * elemanlara düştüğünde `click` ikisinin ORTAK ATASINA gidiyor, yani
     * bloğun içindeki butona değil çevresindeki `div`'e. Ekrandaki teşhis
     * panelinde birebir bu görüldü ("bas: button … tik: div"), ve tıklamanın
     * bazen çalışıp bazen çalışmamasının sebebi buydu. Basma-bırakma çiftini
     * zaten burada takip ediyoruz; kararı da burada veriyoruz.
     */
    if (!active) {
      if (drag.kind === "move") tapHandlersRef.current.get(info.id)?.();
      return;
    }

    // Eşiği aştı ama randevu yerinden oynamadı: fare basılıyken birkaç piksel
    // kaymış, kullanıcı yine de TIKLADI. Üç piksellik eşik küçük bir bloğa
    // nişan alan bir el için çok dar ve burayı bastırmak, tıklamanın bazen
    // çalışıp bazen çalışmaması demekti — takvimde en sık yapılan iş budur.
    // Tıklamayı yalnızca gerçekten taşınmış bir randevudan sonra bastırıyoruz.
    if (!isMoved(info, draft)) {
      publish(info.id, null);
      tapHandlersRef.current.get(info.id)?.();
      return;
    }

    suppressNextClick();
    commit(info, draft);
  };

  const registerTap = useCallback((id: string, handler: () => void) => {
    const handlers = tapHandlersRef.current;
    handlers.set(id, handler);
    return () => {
      // Aynı id'yi başka bir blok devraldıysa onun kaydını silme
      if (handlers.get(id) === handler) handlers.delete(id);
    };
  }, []);

  /** Sürüklemeden sonraki tıklama bağlantıyı açmasın. */
  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  /** Odak tutamaktan ayrılırsa bekleyen süre değişikliği kaybolmasın. */
  const onBlurCapture = () => {
    if (keyRef.current) flushKeyResize();
  };

  // Escape vazgeçirir; pencere odağı kaybolursa sürükleme bırakılır.
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      const drag = dragRef.current;
      if (event.key !== "Escape" || !drag) return;
      publish(drag.info.id, null);
      suppressNextClick();
      releaseDrag();
    };
    window.addEventListener("keydown", onEscape);
    window.addEventListener("blur", releaseDrag);
    return () => {
      window.removeEventListener("keydown", onEscape);
      window.removeEventListener("blur", releaseDrag);
      releaseDrag();
    };
  }, [publish, releaseDrag, suppressNextClick]);

  const api = useMemo<GridApi>(
    () => ({
      bounds,
      pxPerMinute,
      dayStartsAtMs,
      formatTime,
      subscribe,
      read,
      clear,
      begin,
      resizeByKey,
      registerTap,
    }),
    [
      bounds,
      pxPerMinute,
      dayStartsAtMs,
      formatTime,
      subscribe,
      read,
      clear,
      begin,
      resizeByKey,
      registerTap,
    ],
  );

  return (
    <GridContext.Provider value={api}>
      <div
        ref={rootRef}
        className="flex flex-col gap-2"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={releaseDrag}
        onClickCapture={onClickCapture}
        onBlurCapture={onBlurCapture}
      >
        {error && (
          <Alert tone="error">
            <span className="flex items-start gap-3">
              <span className="min-w-0 flex-1">{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="shrink-0 rounded-sm px-1 text-ink-2 transition-colors duration-150 hover:text-ink"
              >
                Kapat
              </button>
            </span>
          </Alert>
        )}

        <div
          ref={scrollerRef}
          data-arrow-scroll
          tabIndex={0}
          role="region"
          aria-label={`${label} takvimi`}
          // Masaüstünde menü artık solda: başlığın altındaki sekme satırı
          // gitti, ızgara o iki satırı geri alıyor.
          className="max-h-[calc(100dvh-15rem)] min-h-80 overflow-auto overscroll-contain rounded border border-border bg-surface lg:max-h-[calc(100dvh-13rem)]"
        >
          {children}
        </div>

        <p role="status" aria-live="polite" className="sr-only">
          {live}
        </p>
      </div>
    </GridContext.Provider>
  );
}
