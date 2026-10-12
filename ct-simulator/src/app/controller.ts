/**
 * İş akışı denetleyicisi: hasta yükleme, masa konumlandırma, topogram, helikal tarama
 * zamanlaması (kontrast gecikmesi, nefes tutma, X-ışını), rekonstrüksiyon görevleri.
 */
import { machine, waitFor } from './machine';
import { liveStore, seriesStore, topoStore, type SeriesData } from './data';
import { useApp, type SeriesMeta } from '../state/store';
import { getPool } from '../sim/pool';
import { computeTopogramChunk, topogramRows, type TopogramChunk, type TopogramRequest } from '../sim/topogram';
import { BREATHING, planScan, PROTOCOLS, ROW_WIDTH, type DwProfile, type ScanParams, type ScanPlan } from '../sim/scan';
import type { SliceRequest, SliceResult } from '../sim/protocol';
import { KERNELS } from '../physics/kernels';
import { heightForCenter, isoYp, TABLE_SCAN_MIN_H, TOPO_SPEED, T_LOAD } from '../scene/dims';
import { torsoAt } from '../phantom/anatomy/common';

const S = () => useApp.getState();
let abortFlag = false;
let seriesCounter = 1;
let skipWait = false;

export function log(text: string, level: 'info' | 'warn' | 'ok' = 'info') {
  S().addLog(text, level);
}

/* ------------------------------------------------------------------ */
/* Hasta                                                              */
/* ------------------------------------------------------------------ */

export function registerPatient() {
  const st = S();
  st.set({ patient: { ...st.patient, registered: true }, step: 'position' });
  log(`Hasta kaydı oluşturuldu: SENTETİK^FANTOM (${st.patient.id}), protokol: ${PROTOCOLS.find((p) => p.id === st.params.protocolId)?.label}`, 'ok');
}

export async function loadPatient() {
  const st = S();
  if (!st.patient.registered) registerPatient();
  // masa yükleme pozisyonunda ve alçakta olmalı
  machine.targetT = T_LOAD;
  machine.targetH = 0.52;
  log('Masa yükleme pozisyonuna getiriliyor…');
  await waitFor(() => Math.abs(machine.tableT - T_LOAD) < 1 && Math.abs(machine.tableH - 0.52) < 0.002, 30000);
  machine.patientTarget = 1;
  log('Hasta masaya alınıyor (baş önde, sırtüstü – HFS).');
  await waitFor(() => machine.patientT >= 0.999, 10000);
  S().set({ patient: { ...S().patient, onTable: true }, step: 'position', tab: 'position' });
  log('Hasta masada. Masayı yükseltip lazerlerle hizalayın.', 'ok');
}

export async function unloadPatient() {
  machine.targetT = T_LOAD;
  machine.targetH = 0.52;
  await waitFor(() => Math.abs(machine.tableT - T_LOAD) < 1 && Math.abs(machine.tableH - 0.52) < 0.002, 30000);
  machine.patientTarget = 0;
  await waitFor(() => machine.patientT <= 0.001, 10000);
  S().set({ patient: { ...S().patient, onTable: false } });
  log('Hasta masadan indirildi.');
}

/** Hasta merkezinin (yp) masaya göre y değeri: protokol bölgesine göre. */
export function patientCenterY(): number {
  const st = S();
  const zMid = (st.params.scanStart + st.params.scanEnd) / 2;
  if (zMid < 240) return 18;
  const L = torsoAt(Math.min(900, Math.max(260, zMid)), 1);
  return L ? L.skin.cy : 10;
}

export function autoCenter() {
  machine.targetH = heightForCenter(patientCenterY());
  log(`Otomatik izomerkez: masa yüksekliği ${(machine.targetH * 1000).toFixed(0)} mm'ye ayarlanıyor.`);
}

/** Landmark'ı dış lazer altına getir. */
export function moveToLandmark() {
  const st = S();
  const zMid = st.params.scanStart;
  machine.targetT = zMid - 460;
  log(`Masa referans noktasına (${PROTOCOLS.find((p) => p.id === st.params.protocolId)?.landmark}) ilerletiliyor.`);
}

/* ------------------------------------------------------------------ */
/* Topogram                                                           */
/* ------------------------------------------------------------------ */

export async function acquireTopogram() {
  const st = S();
  if (!st.patient.onTable) {
    log('Önce hastayı masaya alın.', 'warn');
    return;
  }
  if (machine.tableH < TABLE_SCAN_MIN_H) {
    log('Masa yüksekliği yetersiz – önce masayı izomerkeze yükseltin.', 'warn');
    return;
  }
  abortFlag = false;
  const { view, z0, z1, kVp, mA } = st.topo;
  const dz = 2, dx = 1.6;
  const req: TopogramRequest = { view, z0, z1, dz, dx, width: 500, kVp, mA, isoXp: 0, isoYp: isoYp(machine.tableH), seed: Math.floor(Math.random() * 1e6) };
  const rows = topogramRows(req);
  const cols = Math.ceil(500 / dx) + (Math.ceil(500 / dx) % 2);
  const data = new Float32Array(rows * cols);
  const td = { view, z0, dz, dx, rows, cols, data, dw: new Float32Array(rows), rowsReady: new Uint8Array(rows), muRef: 0.2, kVp, mA, isoXp: 0 };
  topoStore.current = td;
  st.set({ topo: { ...st.topo, status: 'acquiring', rows, cols, dz, dx, rowsDone: 0, version: st.topo.version + 1, isoYp: req.isoYp }, step: 'topogram' });
  log(`Topogram (${view}) başlıyor: ${kVp} kV, ${mA} mA, ${(z1 - z0).toFixed(0)} mm.`);
  // Hesaplamayı paralel başlat
  const pool = getPool();
  const chunk = 24;
  const jobs: Promise<void>[] = [];
  for (let r = 0; r < rows; r += chunk) {
    const sub = { ...req, rowFrom: r, rowTo: Math.min(rows, r + chunk) };
    jobs.push(
      pool
        .run<TopogramChunk>({ type: 'topogram', cfg: st.patient.cfg, req: sub }, r)
        .then((c) => {
          td.data.set(c.data, c.rowFrom * cols);
          td.dw.set(c.dw, c.rowFrom);
          td.muRef = c.muRef;
          td.rowsReady.fill(1, c.rowFrom, c.rowTo);
        })
        .catch(() => undefined),
    );
  }
  // Masa hareketi
  const tStart = z0 - 20, tEnd = z1 + 10;
  machine.targetT = tStart;
  machine.hSpeed = 220;
  await waitFor(() => Math.abs(machine.tableT - tStart) < 1, 30000);
  machine.hSpeed = 160;
  machine.tubePark = view === 'AP' ? 0 : -Math.PI / 2;
  machine.rotorTarget = 0;
  machine.beamWidth = 0.004;
  machine.beam = 'topogram';
  machine.xrayLamp = true;
  machine.driveSpeed = TOPO_SPEED;
  await waitFor(() => machine.tableT >= tEnd || abortFlag, 60000);
  machine.driveSpeed = null;
  machine.targetT = machine.tableT;
  machine.beam = 'off';
  machine.xrayLamp = false;
  await Promise.all(jobs);
  if (abortFlag) {
    S().set({ topo: { ...S().topo, status: 'none' } });
    log('Topogram iptal edildi.', 'warn');
    return;
  }
  S().set({ topo: { ...S().topo, status: 'done', rowsDone: rows, version: S().topo.version + 1 }, step: 'plan', tab: 'plan' });
  log('Topogram tamamlandı. Tarama aralığını topogram üzerinde planlayın.', 'ok');
}

/** Topogram hesaplamasını ana iş parçacığında senkron yap (testler için). */
export function topogramSync(req: TopogramRequest, model: Parameters<typeof computeTopogramChunk>[0]) {
  return computeTopogramChunk(model, req);
}

export function dwProfile(): DwProfile | null {
  const t = topoStore.current;
  if (!t || S().topo.status !== 'done') return null;
  return { z0: t.z0, dz: t.dz, dw: t.dw };
}

/* ------------------------------------------------------------------ */
/* Tarama                                                             */
/* ------------------------------------------------------------------ */

export function currentPlan(): ScanPlan {
  return planScan(S().params, dwProfile());
}

function buildBase(p: ScanParams, plan: ScanPlan, seed: number): SliceRequest {
  return {
    z: 0,
    thickness: p.thickness,
    pitch: p.pitch,
    rowWidth: ROW_WIDTH,
    kVp: p.kVp,
    mAsEff: plan.mAsEffNominal,
    angularMod: p.atcm,
    kernel: p.kernel,
    recon: p.recon,
    irLevel: p.irLevel,
    mar: p.mar,
    dfov: p.dfov,
    matrix: p.matrix,
    reconCx: p.reconCx,
    reconCy: 0,
    isoXp: 0,
    isoYp: isoYp(machine.tableH),
    quality: p.quality,
    bowtie: plan.bowtie,
    focalLarge: plan.focalLarge,
    timeS: null,
    seed,
    rotTime: p.rotTime,
    collimation: plan.collimation,
    scatterCorr: p.scatterCorr,
    breathAmp: BREATHING[S().patient.breathing].amp,
    breathStartS: BREATHING[S().patient.breathing].start,
    breathPeriod: 4,
    breathPhase: ((seed % 1000) / 1000) * 2 * Math.PI,
  };
}

function seriesName(p: { thickness: number; kernel: string; recon: string; irLevel: number }): string {
  const k = KERNELS[p.kernel as keyof typeof KERNELS]?.label ?? p.kernel;
  return `${p.thickness} mm ${k} ${p.recon === 'IR' ? `IR-${p.irLevel}` : 'FBP'}`;
}

function createSeries(p: ScanParams, plan: ScanPlan, base: SliceRequest, seed: number, reconOverride?: Partial<ScanParams>): SeriesData {
  const pp = { ...p, ...reconOverride };
  const id = `S${Date.now().toString(36)}${seriesCounter}`;
  const z0 = Math.min(p.scanStart, p.scanEnd), z1 = Math.max(p.scanStart, p.scanEnd);
  const n = Math.max(1, Math.floor((z1 - z0) / pp.interval + 1e-6) + 1);
  const zs = Array.from({ length: n }, (_, i) => z0 + i * pp.interval);
  const sd: SeriesData = {
    id,
    base: { ...base, thickness: pp.thickness, kernel: pp.kernel, recon: pp.recon, irLevel: pp.irLevel, mar: pp.mar, dfov: pp.dfov, matrix: pp.matrix, reconCx: pp.reconCx },
    params: pp,
    plan,
    zs,
    planned: plan.slices,
    m: pp.matrix,
    pix: pp.dfov / pp.matrix,
    cx: pp.reconCx,
    cy: 0,
    slices: new Array(n).fill(null),
    stats: new Array(n).fill(null),
    debug: null,
    debugZ: null,
    seed,
    version: 0,
  };
  seriesStore.set(id, sd);
  const meta: SeriesMeta = {
    id,
    name: `${seriesCounter++}: ${seriesName(pp)}`,
    desc: `${plan.region} · ${pp.kVp} kV · ${plan.mAsEffNominal.toFixed(0)} eff.mAs · pitch ${pp.pitch} · ${pp.contrast ? 'kontrastlı' : 'kontrastsız'}`,
    created: Date.now(),
    nTotal: n,
    nDone: 0,
    m: pp.matrix,
    dfov: pp.dfov,
    thickness: pp.thickness,
    interval: pp.interval,
    kernel: pp.kernel,
    recon: pp.recon === 'IR' ? `IR-${pp.irLevel}` : 'FBP',
    kVp: pp.kVp,
    version: 0,
  };
  S().set({ series: [...S().series, meta], activeSeries: id });
  return sd;
}

function plannedAt(plan: ScanPlan, z: number) {
  let best = plan.slices[0], bd = Infinity;
  for (const s of plan.slices) {
    const d = Math.abs(s.z - z);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

let lastRate = { t: 0, n: 0 };

function dispatchSlice(sd: SeriesData, idx: number, prio: number, debug = false) {
  const z = sd.zs[idx];
  const ps = plannedAt(sd.plan, z);
  const req: SliceRequest = { ...sd.base, z, mAsEff: ps.mAsEff, timeS: ps.t, tAcq: ps.tAcq, debug };
  const cfg = S().patient.cfg;
  getPool()
    .run<SliceResult>({ type: 'slice', cfg, req }, prio)
    .then((r) => {
      sd.slices[idx] = r.hu;
      sd.stats[idx] = r.stats;
      if (r.debug) {
        sd.debug = r.debug;
        sd.debugZ = z;
      }
      sd.version++;
      const done = sd.slices.filter((s) => s).length;
      S().updateSeries(sd.id, { nDone: done, version: sd.version });
      const sc = S().scan;
      if (sc.reconSeriesId === sd.id) {
        const now = performance.now();
        let rate = sc.slicesPerSec;
        if (now - lastRate.t > 1500) {
          rate = lastRate.t ? ((done - lastRate.n) * 1000) / (now - lastRate.t) : 0;
          lastRate = { t: now, n: done };
        }
        S().set({ scan: { ...S().scan, reconDone: done, slicesPerSec: rate } });
        if (done === sd.slices.length) log(`Rekonstrüksiyon tamamlandı: ${done} görüntü.`, 'ok');
      }
    })
    .catch((e) => {
      if (String(e).includes('iptal')) return;
      console.error(e);
      log('Rekonstrüksiyon hatası: ' + String(e).slice(0, 160), 'warn');
    });
}

function startRecon(sd: SeriesData, order: number[]) {
  lastRate = { t: 0, n: 0 };
  S().set({ scan: { ...S().scan, reconDone: 0, reconTotal: sd.zs.length, reconSeriesId: sd.id } });
  const mid = order[Math.floor(order.length / 2)];
  order.forEach((idx, k) => dispatchSlice(sd, idx, k, idx === mid));
}

export function abortTopogram() {
  abortFlag = true;
  machine.driveSpeed = null;
  machine.targetT = machine.tableT;
  machine.beam = 'off';
  machine.xrayLamp = false;
  getPool().cancelAll();
}

export function skipContrastWait() {
  skipWait = true;
}

export function abortScan() {
  abortFlag = true;
  machine.driveSpeed = null;
  machine.targetT = machine.tableT;
  machine.beam = 'off';
  machine.xrayLamp = false;
  machine.rotorTarget = 0;
  getPool().cancelAll();
  S().set({ scan: { ...S().scan, status: 'aborted', message: 'Tarama durduruldu.' } });
  log('ACİL DURDURMA: X-ışını kesildi, masa durduruldu.', 'warn');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startScan() {
  const st = S();
  if (!st.patient.onTable) return log('Hasta masada değil.', 'warn');
  if (st.topo.status !== 'done') return log('Önce topogram alın ve tarama aralığını planlayın.', 'warn');
  if (machine.tableH < TABLE_SCAN_MIN_H) return log('Masa yüksekliği yetersiz.', 'warn');
  if (st.scan.status === 'scanning' || st.scan.status === 'preparing' || st.scan.status === 'waiting' || st.scan.status === 'breath') return;
  abortFlag = false;
  skipWait = false;
  const p = st.params;
  const plan = planScan(p, dwProfile());
  const seed = Math.floor(Math.random() * 1e9);
  const base = buildBase(p, plan, seed);
  const sd = createSeries(p, plan, base, seed);
  const dir = p.direction === 'cc' ? 1 : -1;
  const z0 = Math.min(p.scanStart, p.scanEnd), z1 = Math.max(p.scanStart, p.scanEnd);
  const zFirst = dir > 0 ? z0 : z1;
  const zLast = dir > 0 ? z1 : z0;
  const runup = 25;
  const tStart = zFirst - dir * (plan.overrange / 2 + runup);
  const tEnd = zLast + dir * (plan.overrange / 2);
  const upd = (o: Partial<typeof st.scan>) => S().set({ scan: { ...S().scan, ...o } });
  upd({ status: 'preparing', message: 'Masa başlangıç pozisyonuna gidiyor, rotor hızlanıyor…', progress: 0, dlpAccum: 0, reconDone: 0, reconTotal: sd.zs.length, reconSeriesId: sd.id });
  S().set({ step: 'scan', tab: 'scan' });
  log(`Helikal tarama: ${p.kVp} kV, ${plan.mAnominal.toFixed(0)} mA, ${p.rotTime} s rot, pitch ${p.pitch}, ${p.rows}×${ROW_WIDTH} mm, ${plan.scanLength.toFixed(0)} mm, süre ${plan.scanTime.toFixed(1)} s.`);
  for (const w of plan.warnings) log(w, 'warn');
  // canlı veri akışı paneli için hızlı tanılama kesiti (ilk kesit konumu)
  {
    const zl = zFirst + dir * Math.min(plan.scanLength / 2, 40);
    const ps = plannedAt(plan, zl);
    getPool()
      .run<SliceResult>({ type: 'slice', cfg: st.patient.cfg, req: { ...base, z: zl, quality: 'fast', matrix: 256, mAsEff: ps.mAsEff, timeS: ps.t, tAcq: ps.tAcq, debug: true } }, -10)
      .then((r) => {
        liveStore.debug = r.debug ?? null;
        liveStore.z = zl;
        liveStore.stats = r.stats;
        liveStore.hu = r.hu;
        liveStore.m = r.m;
        S().set({ scan: { ...S().scan, liveVer: S().scan.liveVer + 1 } });
      })
      .catch(() => undefined);
  }
  machine.targetT = tStart;
  machine.hSpeed = 220;
  machine.rotorTarget = 1 / p.rotTime;
  machine.beamWidth = plan.collimation / 1000;
  await waitFor(() => Math.abs(machine.tableT - tStart) < 1 || abortFlag, 30000);
  machine.hSpeed = 160;
  if (abortFlag) return;
  // kontrast
  if (p.contrast) {
    machine.injector = true;
    log(`Kontrast enjeksiyonu başladı (100 mL, 350 mgI/mL, 4 mL/s). Tarama gecikmesi ${p.delay} s.`);
    let t = 0;
    const speed = 1;
    while (t < p.delay && !abortFlag) {
      if (skipWait) {
        t = p.delay;
        break;
      }
      const rem = p.delay - t;
      upd({ status: rem < 6 ? 'breath' : 'waiting', countdown: rem, message: rem < 6 ? 'Nefes alın… ve tutun.' : `Kontrast gecikmesi: ${rem.toFixed(0)} s` });
      await sleep(100);
      t += 0.1 * speed;
    }
  } else {
    upd({ status: 'breath', message: st.patient.breathing === 'hold' ? 'Nefes alın… ve tutun.' : 'Nefes alın… ve tutun. (Hasta nefesini tutamıyor – serbest solunum)', countdown: 2.5 });
    await sleep(2500);
  }
  if (abortFlag) return;
  // X-ışını
  machine.beam = 'helical';
  machine.xrayLamp = true;
  machine.driveSpeed = dir * plan.tableSpeed;
  const total = Math.abs(tEnd - tStart) - runup;
  upd({ status: 'scanning', message: 'X-IŞINI AÇIK – helikal veri toplama' });
  const order = sd.zs.map((_, i) => i);
  if (dir < 0) order.reverse();
  let dispatched = 0;
  const t0 = performance.now();
  let dlp = 0;
  let lastT = machine.tableT;
  lastRate = { t: 0, n: 0 };
  const debugIdx = order[Math.floor(order.length / 2)];
  while (!abortFlag) {
    const T = machine.tableT;
    const covered = dir * (T - (tStart + dir * runup));
    const progress = Math.max(0, Math.min(1, covered / total));
    const ps = plannedAt(plan, Math.min(z1, Math.max(z0, T)));
    const inBeam = covered > 0;
    if (inBeam) dlp += (ps.ctdi * Math.abs(T - lastT)) / 10;
    lastT = T;
    // geçilen kesitleri rekonstrüksiyona gönder
    while (dispatched < order.length) {
      const zi = sd.zs[order[dispatched]];
      if (dir * (T - zi) > p.thickness / 2 + plan.collimation / 2) {
        dispatchSlice(sd, order[dispatched], dispatched, order[dispatched] === debugIdx);
        dispatched++;
      } else break;
    }
    upd({ progress, t: (performance.now() - t0) / 1000, currentZ: T, currentmA: ps.mA, dlpAccum: dlp, reconDone: sd.slices.filter((s) => s).length });
    if (dir * (T - tEnd) >= 0) break;
    await sleep(50);
  }
  machine.driveSpeed = null;
  machine.targetT = machine.tableT;
  machine.beam = 'off';
  machine.xrayLamp = false;
  machine.injector = false;
  if (abortFlag) return;
  while (dispatched < order.length) {
    dispatchSlice(sd, order[dispatched], dispatched, order[dispatched] === debugIdx);
    dispatched++;
  }
  upd({ status: 'done', progress: 1, message: 'Tarama tamamlandı – rekonstrüksiyon sürüyor.', dlpAccum: plan.dlp });
  log(`Tarama tamamlandı. CTDIvol ${plan.ctdiVol.toFixed(1)} mGy, DLP ${plan.dlp.toFixed(0)} mGy·cm, E≈${plan.effDose.toFixed(1)} mSv.`, 'ok');
  S().set({ step: 'review' });
  setTimeout(() => {
    if (machine.beam === 'off') machine.rotorTarget = 0;
  }, 4000);
}

/** Aynı ham veriden (tohum + plan) farklı rekonstrüksiyon parametreleriyle yeni seri. */
export function retroRecon(override: Partial<ScanParams>) {
  const st = S();
  const srcId = st.activeSeries;
  const src = srcId ? seriesStore.get(srcId) : null;
  if (!src) return log('Önce bir tarama yapın.', 'warn');
  const p = src.params;
  const pp = { ...p, ...override };
  if (pp.thickness < ROW_WIDTH) return log('Kesit kalınlığı dedektör satırından ince olamaz.', 'warn');
  const sd = createSeries(p, src.plan, { ...src.base }, src.seed, override);
  log(`Retrospektif rekonstrüksiyon: ${seriesName(pp)} (${sd.zs.length} görüntü) – aynı ham veri.`, 'ok');
  startRecon(sd, sd.zs.map((_, i) => i));
}

export function isBusy(): boolean {
  const s = S().scan.status;
  return s === 'preparing' || s === 'waiting' || s === 'breath' || s === 'scanning' || S().topo.status === 'acquiring';
}

export function applyProtocol(id: string) {
  const pr = PROTOCOLS.find((p) => p.id === id);
  if (!pr) return;
  const st = S();
  st.set({ params: { protocolId: id, ...pr.params }, topo: { ...st.topo, z0: pr.topoRange[0], z1: pr.topoRange[1] } });
  if (!st.patient.onTable) st.setPatientCfg({ arms: pr.arms, implant: id === 'pelvis' ? 'hipRight' : st.patient.cfg.implant });
  log(`Protokol seçildi: ${pr.label}`);
}
