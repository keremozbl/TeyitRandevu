import assert from "node:assert/strict";
import { test } from "node:test";

import {
  intervalContains,
  intervalMinutes,
  intervalsOverlap,
  mergeIntervals,
  subtractIntervals,
  type Interval,
} from "./intervals.ts";

const at = (hhmm: string) => new Date(`2026-08-24T${hhmm}:00Z`);
const span = (from: string, to: string): Interval => ({ start: at(from), end: at(to) });
const show = (intervals: Interval[]) =>
  intervals.map((i) => `${i.start.toISOString().slice(11, 16)}-${i.end.toISOString().slice(11, 16)}`);

test("çakışan ve uç uca değen aralıklar birleşir", () => {
  assert.deepEqual(show(mergeIntervals([span("09:00", "10:00"), span("09:30", "11:00")])), [
    "09:00-11:00",
  ]);
  assert.deepEqual(show(mergeIntervals([span("09:00", "10:00"), span("10:00", "11:00")])), [
    "09:00-11:00",
  ]);
  assert.deepEqual(show(mergeIntervals([span("10:00", "11:00"), span("09:00", "09:30")])), [
    "09:00-09:30",
    "10:00-11:00",
  ]);
});

test("içi içe geçmiş aralık dıştakini bozmaz", () => {
  assert.deepEqual(show(mergeIntervals([span("09:00", "12:00"), span("10:00", "10:30")])), [
    "09:00-12:00",
  ]);
});

test("sıfır uzunluklu aralık atılır", () => {
  assert.deepEqual(show(mergeIntervals([span("09:00", "09:00")])), []);
});

test("ortadan çıkarma iki parça bırakır", () => {
  assert.deepEqual(show(subtractIntervals([span("09:00", "17:00")], [span("12:00", "13:00")])), [
    "09:00-12:00",
    "13:00-17:00",
  ]);
});

test("uçtan çıkarma tek parça bırakır", () => {
  assert.deepEqual(show(subtractIntervals([span("09:00", "17:00")], [span("08:00", "10:00")])), [
    "10:00-17:00",
  ]);
  assert.deepEqual(show(subtractIntervals([span("09:00", "17:00")], [span("16:00", "18:00")])), [
    "09:00-16:00",
  ]);
});

test("tamamını kaplayan çıkarma hiçbir şey bırakmaz", () => {
  assert.deepEqual(show(subtractIntervals([span("09:00", "17:00")], [span("08:00", "18:00")])), []);
});

test("değmeyen çıkarma aralığı olduğu gibi bırakır", () => {
  assert.deepEqual(show(subtractIntervals([span("09:00", "12:00")], [span("12:00", "13:00")])), [
    "09:00-12:00",
  ]);
});

test("birden çok pencereden birden çok delik çıkarılır", () => {
  const base = [span("09:00", "12:00"), span("13:00", "18:00")];
  const cuts = [span("10:00", "10:30"), span("11:45", "13:30"), span("17:00", "17:15")];
  assert.deepEqual(show(subtractIntervals(base, cuts)), [
    "09:00-10:00",
    "10:30-11:45",
    "13:30-17:00",
    "17:15-18:00",
  ]);
});

test("yarı açıklık: uç uca gelen randevular çakışmaz", () => {
  assert.equal(intervalsOverlap(span("09:00", "10:00"), span("10:00", "11:00")), false);
  assert.equal(intervalsOverlap(span("09:00", "10:00"), span("09:59", "11:00")), true);
  assert.equal(intervalsOverlap(span("09:00", "12:00"), span("10:00", "10:30")), true);
});

test("kapsama ve süre", () => {
  assert.equal(intervalContains(span("09:00", "12:00"), span("09:00", "12:00")), true);
  assert.equal(intervalContains(span("09:00", "12:00"), span("11:30", "12:30")), false);
  assert.equal(intervalMinutes(span("09:00", "10:30")), 90);
});
