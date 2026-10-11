/**
 * Web worker havuzu. Worker oluşturulamazsa (ör. kısıtlı ortam) görevler ana iş
 * parçacığında, arayüzü kilitlememek için sırayla ve aralıklı çalıştırılır.
 */
import type { WorkerTask } from './worker';
import SimWorker from './worker?worker&inline';

type Pending = { task: WorkerTask; resolve: (v: unknown) => void; reject: (e: unknown) => void; gen: number; prio: number };

export class SimPool {
  private workers: Worker[] = [];
  private busy: boolean[] = [];
  private queue: Pending[] = [];
  private inflight = new Map<number, Pending>();
  private nextId = 1;
  private gen = 0;
  readonly size: number;
  private fallback = false;
  private fallbackRunning = false;

  constructor(n?: number) {
    const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    this.size = Math.max(1, Math.min(n ?? hc - 1, 8));
    try {
      for (let i = 0; i < this.size; i++) {
        const w = new SimWorker();
        w.onmessage = (ev) => this.onMessage(i, ev.data);
        w.onerror = (e) => {
          console.error('Worker hatası', e);
          this.enableFallback();
        };
        this.workers.push(w);
        this.busy.push(false);
      }
    } catch (e) {
      console.warn('Web worker kullanılamıyor, ana iş parçacığına düşülüyor', e);
      this.enableFallback();
    }
  }

  get usingWorkers(): boolean {
    return !this.fallback;
  }

  private enableFallback() {
    if (this.fallback) return;
    this.fallback = true;
    for (const w of this.workers) w.terminate();
    this.workers = [];
    // uçuştaki görevleri kuyruğa geri al
    for (const p of this.inflight.values()) this.queue.unshift(p);
    this.inflight.clear();
    this.pump();
  }

  /** Mevcut iş neslini iptal eder (kuyruktaki görevler reddedilir). */
  cancelAll(): void {
    this.gen++;
    for (const p of this.queue) p.reject(new Error('iptal'));
    this.queue = [];
  }

  run<T>(task: Omit<WorkerTask, 'id'>, prio = 0): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = this.nextId++;
      const p: Pending = { task: { ...task, id } as WorkerTask, resolve: resolve as (v: unknown) => void, reject, gen: this.gen, prio };
      // öncelik sırasına ekle (küçük prio önce)
      let i = this.queue.length;
      while (i > 0 && this.queue[i - 1].prio > prio) i--;
      this.queue.splice(i, 0, p);
      this.pump();
    });
  }

  private pump() {
    if (this.fallback) {
      if (this.fallbackRunning) return;
      this.fallbackRunning = true;
      const step = async () => {
        const { runTask } = await import('./worker');
        while (this.queue.length) {
          const p = this.queue.shift()!;
          if (p.gen !== this.gen) continue;
          await new Promise((r) => setTimeout(r, 0));
          try {
            p.resolve(runTask(p.task).result);
          } catch (e) {
            p.reject(e);
          }
        }
        this.fallbackRunning = false;
      };
      void step();
      return;
    }
    for (let i = 0; i < this.workers.length; i++) {
      if (this.busy[i]) continue;
      let p: Pending | undefined;
      while ((p = this.queue.shift()) && p.gen !== this.gen) p.reject(new Error('iptal'));
      if (!p) return;
      this.busy[i] = true;
      this.inflight.set(p.task.id, p);
      this.workers[i].postMessage(p.task);
    }
  }

  private onMessage(i: number, msg: { id: number; ok: boolean; result?: unknown; error?: string }) {
    this.busy[i] = false;
    const p = this.inflight.get(msg.id);
    this.inflight.delete(msg.id);
    if (p) {
      if (p.gen !== this.gen) p.reject(new Error('iptal'));
      else if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error));
    }
    this.pump();
  }
}

let pool: SimPool | null = null;
export function getPool(): SimPool {
  if (!pool) pool = new SimPool();
  return pool;
}
