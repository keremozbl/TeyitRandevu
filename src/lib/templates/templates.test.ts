import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { TEMPLATE_VARIABLES } from "../notifications/render.ts";

/**
 * Sektör şablonlarının denetimi.
 *
 * Şablonlar artık kod değil içerik: yeni bir sektör eklemek bir JSON dosyası
 * koymaktır. Bozuk bir şablon derlemeyi durdurmaz, kurulum RPC'sini çağırdığı
 * anda patlar — yani hatayı ilk gören müşteri olur. Bu yüzden veritabanının
 * uyguladığı kısıtlar burada bir kez daha sınanıyor:
 *
 *   - alan anahtarı `field_definitions.key` check kısıtına uymalı
 *   - kind / trigger / channel değerleri enum'larda olmalı
 *   - mesaj metnindeki değişkenler render'ın tanıdığı listede olmalı
 *   - SAĞLIK ailesinde ticari ileti şablonu OLMAMALI (CLAUDE.md kural 7)
 *
 * Dosyalar `fs` ile okunuyor: Node'un test koşucusu `@/` takma adını
 * çözemiyor ve JSON import'u içe aktarma niteliği (`with { type: "json" }`)
 * istiyor. Okumak, iki sorunu birden atlatan en sade yol.
 */

const DIR = path.join(process.cwd(), "src", "lib", "templates");

const FAMILIES = new Set(["saglik", "kisisel_bakim", "hizmet"]);
const FIELD_KINDS = new Set([
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "multiselect",
  "boolean",
  "phone",
]);
const TRIGGERS = new Set([
  "appointment_created",
  "before_start",
  "after_end",
  "no_show",
  "birthday",
]);
const CHANNELS = new Set(["sms", "whatsapp", "email", "voice"]);
const RESOURCE_KINDS = new Set(["staff", "room", "device"]);

/** seed.sql'deki `role_templates` kataloğu — aile başına geçerli roller. */
const ROLES_BY_FAMILY: Record<string, Set<string>> = {
  saglik: new Set(["owner", "admin", "hekim", "asistan", "resepsiyon", "muhasebe"]),
  kisisel_bakim: new Set(["owner", "admin", "uygulayici", "resepsiyon", "muhasebe"]),
  hizmet: new Set(["owner", "admin", "uygulayici", "resepsiyon", "muhasebe"]),
};

const FIELD_KEY = /^[a-z][a-z0-9_]{0,40}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

type Template = {
  key: string;
  family: string;
  label: string;
  description: string;
  terminology: Record<string, string>;
  roles: string[];
  booking_rules: Record<string, number>;
  resources: { kind: string; name: string }[];
  working_hours: {
    weekdays: number[];
    starts_at: string;
    ends_at: string;
    break: { starts_at: string; ends_at: string } | null;
  };
  services: {
    name: string;
    duration_min: number;
    buffer_before_min?: number;
    buffer_after_min?: number;
  }[];
  customer_fields: { key: string; label: string; kind: string; options?: string[] }[];
  appointment_fields: { key: string; label: string; kind: string; options?: string[] }[];
  notification_defaults: {
    key: string;
    trigger: string;
    channel: string;
    is_commercial: boolean;
    body: string;
    offset_minutes: number;
  }[];
};

const files = readdirSync(DIR).filter((name) => name.endsWith(".json"));
const templates: Template[] = files.map(
  (name) => JSON.parse(readFileSync(path.join(DIR, name), "utf8")) as Template,
);

const KNOWN_VARIABLES = new Set(TEMPLATE_VARIABLES.map((variable) => variable.key));

const minutes = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};

test("şablon dosyası bulunuyor ve anahtarlar benzersiz", () => {
  assert.ok(templates.length >= 2, "en az iki sektör şablonu bekleniyor");
  const keys = templates.map((t) => t.key);
  assert.equal(new Set(keys).size, keys.length, `tekrarlayan şablon anahtarı: ${keys}`);
});

for (const template of templates) {
  test(`${template.key}: kimlik ve aile`, () => {
    assert.match(template.key, /^[a-z][a-z0-9_]*$/);
    assert.ok(FAMILIES.has(template.family), `bilinmeyen aile: ${template.family}`);
    assert.ok(template.label.length > 0);
    assert.ok(template.description.length > 0);

    for (const role of template.roles) {
      assert.ok(
        ROLES_BY_FAMILY[template.family].has(role),
        `${template.key}: bu ailede olmayan rol: ${role}`,
      );
    }
  });

  test(`${template.key}: terminoloji tam`, () => {
    for (const key of [
      "customer_singular",
      "customer_plural",
      "service_singular",
      "service_plural",
      "resource_singular",
      "resource_plural",
      "appointment_singular",
      "appointment_plural",
    ]) {
      assert.ok(template.terminology[key], `${template.key}: terminoloji eksik: ${key}`);
    }
  });

  test(`${template.key}: çalışma saatleri tutarlı`, () => {
    const { weekdays, starts_at, ends_at } = template.working_hours;
    assert.ok(weekdays.length > 0);
    assert.equal(new Set(weekdays).size, weekdays.length, "gün tekrarı");
    for (const day of weekdays) assert.ok(day >= 0 && day <= 6, `geçersiz gün: ${day}`);

    assert.match(starts_at, TIME);
    assert.match(ends_at, TIME);
    assert.ok(minutes(starts_at) < minutes(ends_at), "başlangıç bitişten sonra");

    const rest = template.working_hours.break;
    if (rest) {
      assert.match(rest.starts_at, TIME);
      assert.match(rest.ends_at, TIME);
      assert.ok(minutes(rest.starts_at) < minutes(rest.ends_at), "mola ters");
      assert.ok(
        minutes(rest.starts_at) >= minutes(starts_at) && minutes(rest.ends_at) <= minutes(ends_at),
        "mola çalışma saatlerinin dışında",
      );
    }
  });

  test(`${template.key}: kaynaklar ve hizmetler`, () => {
    assert.ok(template.resources.length > 0, "en az bir kaynak");
    assert.ok(
      template.resources.some((resource) => resource.kind === "staff"),
      "en az bir personel kaynağı — hizmetler ona bağlanıyor",
    );
    for (const resource of template.resources) {
      assert.ok(RESOURCE_KINDS.has(resource.kind), `bilinmeyen kaynak türü: ${resource.kind}`);
      assert.ok(resource.name.length > 0);
    }

    const names = template.services.map((service) => service.name);
    assert.equal(new Set(names).size, names.length, "tekrarlayan hizmet adı");
    for (const service of template.services) {
      assert.ok(service.duration_min > 0, `${service.name}: süre sıfır`);
      assert.ok((service.buffer_before_min ?? 0) >= 0);
      assert.ok((service.buffer_after_min ?? 0) >= 0);
    }
  });

  test(`${template.key}: alan tanımları veritabanı kısıtına uyuyor`, () => {
    for (const [entity, fields] of [
      ["customer", template.customer_fields],
      ["appointment", template.appointment_fields],
    ] as const) {
      const keys = fields.map((field) => field.key);
      assert.equal(new Set(keys).size, keys.length, `${entity}: tekrarlayan alan anahtarı`);

      for (const field of fields) {
        // field_definitions.key check kısıtı (40_customers.sql)
        assert.match(field.key, FIELD_KEY, `${entity}.${field.key}: anahtar kısıta uymuyor`);
        assert.ok(FIELD_KINDS.has(field.kind), `${entity}.${field.key}: bilinmeyen tür`);
        assert.ok(field.label.length > 0);
        if (field.kind === "select" || field.kind === "multiselect") {
          assert.ok(
            (field.options?.length ?? 0) > 0,
            `${entity}.${field.key}: seçenek listesi boş`,
          );
        }
      }
    }
  });

  test(`${template.key}: bildirim şablonları`, () => {
    const keys = template.notification_defaults.map((notification) => notification.key);
    assert.equal(new Set(keys).size, keys.length, "tekrarlayan bildirim anahtarı");

    for (const notification of template.notification_defaults) {
      assert.match(notification.key, /^[a-z][a-z0-9_]*$/);
      assert.ok(TRIGGERS.has(notification.trigger), `bilinmeyen tetikleyici: ${notification.trigger}`);
      assert.ok(CHANNELS.has(notification.channel), `bilinmeyen kanal: ${notification.channel}`);
      assert.ok(notification.body.trim().length > 0);

      if (notification.trigger === "before_start") {
        assert.ok(notification.offset_minutes < 0, `${notification.key}: önce giden mesaj eksi ofset ister`);
      }

      for (const match of notification.body.matchAll(/\{\{([^}]+)\}\}/g)) {
        const name = match[1].trim();
        assert.ok(
          KNOWN_VARIABLES.has(name),
          `${template.key}/${notification.key}: tanınmayan değişken {{${name}}}`,
        );
      }
    }
  });

  test(`${template.key}: sağlık ailesinde ticari ileti şablonu yok`, () => {
    if (template.family !== "saglik") return;
    // Sağlık Bakanlığı tanıtım mevzuatı: kampanya/indirim şablonu sunulmaz.
    const commercial = template.notification_defaults.filter(
      (notification) => notification.is_commercial,
    );
    assert.equal(
      commercial.length,
      0,
      `${template.key}: sağlık sektöründe ticari şablon olamaz: ${commercial.map((c) => c.key)}`,
    );
  });
}
