/**
 * Cihazın anlık (60 Hz) mekanik durumu: masa, rotor, X-ışını, lazerler.
 * React dışında tutulur; 3B sahne her karede doğrudan okur, arayüz ise
 * store üzerinden düşük frekansta günceller.
 */
import { TABLE_H_SPEED, TABLE_MAX_H, TABLE_MIN_H, TABLE_SCAN_MIN_H, TABLE_V_SPEED, T_MAX, T_MIN, T_LOAD } from '../scene/dims';

export type BeamMode = 'off' | 'topogram' | 'helical';

export const machine = {
  tableH: 0.52,
  tableT: T_LOAD,
  targetH: 0.52,
  targetT: T_LOAD,
  /** sürekli hız kontrolü (tarama sırasında) mm/s; null → hedefe git */
  driveSpeed: null as number | null,
  hSpeed: TABLE_H_SPEED,
  manualH: 0 as -1 | 0 | 1,
  manualT: 0 as -1 | 0 | 1,
  rotorTarget: 0.0, // dev/s
  rotorSpeed: 0.0,
  rotorAngle: 0,
  tubePark: 0, // topogramda tüp açısı (rad)
  beam: 'off' as BeamMode,
  beamWidth: 0.064, // m izomerkezde
  lasers: true,
  cover: 'opaque' as 'opaque' | 'cutaway',
  xrayLamp: false,
  /** hasta yükleme animasyonu: 0 = ayakta yanında, 1 = masada */
  patientT: 0,
  patientTarget: 0,
  patientVisible: true,
  injector: false,
  interlockMsg: '',
};

export type Machine = typeof machine;

let lastUi = 0;
const listeners = new Set<() => void>();
export function onMachineUi(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function tickMachine(dt: number, now: number): void {
  const m = machine;
  // manuel kontrol
  if (m.manualH) m.targetH = Math.min(TABLE_MAX_H, Math.max(TABLE_MIN_H, m.tableH + m.manualH * 0.2));
  if (m.manualT) m.targetT = Math.min(T_MAX, Math.max(T_MIN, m.tableT + m.manualT * 400));
  // dikey
  const dh = m.targetH - m.tableH;
  const vstep = TABLE_V_SPEED * dt;
  m.tableH += Math.abs(dh) < vstep ? dh : Math.sign(dh) * vstep;
  // yatay (kilit: masa alçakken gantriye giremez)
  if (m.driveSpeed !== null) {
    m.tableT += m.driveSpeed * dt;
  } else {
    let tgt = m.targetT;
    const intoGantry = tgt > -880; // beşiğin baş ucu gantri ön yüzüne ulaşıyor
    if (intoGantry && m.tableH < TABLE_SCAN_MIN_H - 0.002) {
      tgt = Math.min(tgt, Math.max(m.tableT, -880));
      m.interlockMsg = 'Masa çok alçak: gantriye girmek için en az 70 cm yüksekliğe çıkarın.';
    } else m.interlockMsg = '';
    const dT = tgt - m.tableT;
    const hs = m.hSpeed * dt;
    m.tableT += Math.abs(dT) < hs ? dT : Math.sign(dT) * hs;
  }
  // rotor ivmelenmesi
  const dr = m.rotorTarget - m.rotorSpeed;
  const acc = 1.2 * dt;
  m.rotorSpeed += Math.abs(dr) < acc ? dr : Math.sign(dr) * acc;
  if (m.beam === 'topogram') m.rotorAngle = m.tubePark;
  else m.rotorAngle = (m.rotorAngle + m.rotorSpeed * dt * Math.PI * 2) % (Math.PI * 2);
  // hasta animasyonu
  const dp = m.patientTarget - m.patientT;
  const ps = dt / 3.2;
  m.patientT += Math.abs(dp) < ps ? dp : Math.sign(dp) * ps;
  if (now - lastUi > 90) {
    lastUi = now;
    listeners.forEach((f) => f());
  }
}

export function tableAtTarget(eps = 0.6): boolean {
  return Math.abs(machine.tableT - machine.targetT) < eps && Math.abs(machine.tableH - machine.targetH) < 0.0015;
}

export function waitFor(cond: () => boolean, timeoutMs = 60000): Promise<boolean> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const loop = () => {
      if (cond()) resolve(true);
      else if (performance.now() - t0 > timeoutMs) resolve(false);
      else setTimeout(loop, 40);
    };
    loop();
  });
}

let running = false;
export function startMachineLoop(): void {
  if (running) return;
  running = true;
  let last = performance.now();
  const step = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    tickMachine(dt, now);
    setTimeout(step, 16);
  };
  step();
}
