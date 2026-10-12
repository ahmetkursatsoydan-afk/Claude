/// <reference lib="webworker" />
/** Simülasyon web worker'ı: fantom önbelleği + kesit/topogram hesapları. */
import { buildPhantom } from '../phantom';
import type { PhantomConfig } from '../phantom/types';
import type { PhantomModel } from '../phantom/raster';
import { computeSlice, type Accel } from './slice';
import { GpuCT } from './gpu';
import { computeTopogramChunk, type TopogramRequest } from './topogram';
import type { SliceRequest } from './protocol';

export type WorkerTask =
  | { type: 'slice'; id: number; cfg: PhantomConfig; req: SliceRequest }
  | { type: 'topogram'; id: number; cfg: PhantomConfig; req: TopogramRequest };

let cachedKey = '';
let model: PhantomModel | null = null;

function getModel(cfg: PhantomConfig): PhantomModel {
  const key = JSON.stringify(cfg);
  if (!model || key !== cachedKey) {
    model = buildPhantom(cfg);
    cachedKey = key;
  }
  return model;
}

let accel: Accel | null | undefined;
/** WebGL2 hızlandırıcıyı bir kez oluştur ve CPU'ya karşı doğrula. */
function getAccel(): Accel | null {
  if (accel !== undefined) return accel;
  accel = null;
  const g = GpuCT.create();
  if (g) {
    try {
      const t = g.selfTest();
      if (!t.ok) console.warn('GPU öz-testi başarısız, CPU kullanılacak', t);
      else {
        const b = g.isSoftware ? { gpu: Infinity, cpu: 0 } : g.benchmark();
        if (b.gpu < b.cpu * 0.8) accel = { name: `GPU (${g.renderer.slice(0, 40)})`, forward: (a, bb, c, d, e, f) => g.forward(a, bb, c, d, e, f), backproject: (a, bb, c, d) => g.backproject(a, bb, c, d) };
        else console.info('WebGL yazılımsal/yavaş; CPU yolu seçildi', g.renderer, b);
      }
    } catch (e) {
      console.warn('GPU hızlandırma kullanılamıyor', e);
    }
  }
  return accel;
}

export function runTask(t: WorkerTask): { result: unknown; transfer: Transferable[] } {
  const m = getModel(t.cfg);
  if (t.type === 'slice') {
    const r = computeSlice(m, t.req, getAccel());
    const transfer: Transferable[] = [r.hu.buffer];
    if (r.debug) transfer.push(r.debug.sino.buffer, r.debug.filtered.buffer, r.debug.phantomPreview.buffer);
    return { result: r, transfer };
  }
  const c = computeTopogramChunk(m, t.req);
  return { result: c, transfer: [c.data.buffer, c.dw.buffer, c.pmax.buffer] };
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;
if (typeof ctx.postMessage === 'function' && typeof (ctx as { document?: unknown }).document === 'undefined') {
  ctx.onmessage = (ev: MessageEvent<WorkerTask>) => {
    const t = ev.data;
    try {
      const { result, transfer } = runTask(t);
      ctx.postMessage({ id: t.id, ok: true, result }, transfer);
    } catch (e) {
      ctx.postMessage({ id: t.id, ok: false, error: String((e as Error)?.stack ?? e) });
    }
  };
}
