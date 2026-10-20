/** Kalibrasyon / QA fantomları (su silindiri, kontrast ekleri). */
import { PhantomModel } from './raster';
import { ellipsoid, props, structure, ell } from './primitives';
import type { Structure } from './types';

export function waterCylinder(diameter = 320, inserts = true): PhantomModel {
  const r = diameter / 2;
  const s: Structure[] = [];
  const pw = props('water');
  s.push(structure('water', -1000, 3000, (_z, out) => out.push({ shape: ell(0, 0, r, r), p: pw })));
  if (inserts) {
    const ins: [number, number, Parameters<typeof props>[0]][] = [
      [0, -r * 0.55, 'corticalBone'],
      [r * 0.55, 0, 'fat'],
      [0, r * 0.55, 'trabecularBone'],
      [-r * 0.55, 0, 'lung'],
    ];
    for (const [x, y, t] of ins) s.push(structure('ins-' + t, -1000, 3000, (_z, out) => out.push({ shape: ell(x, y, 12, 12), p: props(t) })));
    s.push(structure('iodine', -1000, 3000, (_z, out) => out.push({ shape: ell(r * 0.39, r * 0.39, 10, 10), p: { ...props('water'), ch: new Float32Array([1, 0, 0.01, 0]) } })));
  }
  void ellipsoid;
  return new PhantomModel(s);
}

/**
 * Eğitim (QA) fantomu: 32 cm su silindiri; kortikal kemik, yağ, süngerimsi kemik, akciğer,
 * iyot (10 mg/mL) ve hava ekleri; isteğe bağlı iki çelik çubuk (metal artefaktı için).
 * Görüntü oluşumu gezgininde temiz, yorumlaması kolay bir nesne sağlar.
 */
export function eduPhantom(metal = false): PhantomModel {
  const r = 160;
  const s: Structure[] = [];
  s.push(structure('su', -1000, 3000, (_z, out) => out.push({ shape: ell(0, 0, r, r), p: props('water') })));
  const ins: [number, number, number, Parameters<typeof props>[0]][] = [
    [0, -95, 16, 'corticalBone'],
    [95, 0, 16, 'fat'],
    [0, 95, 16, 'trabecularBone'],
    [-95, 0, 16, 'lung'],
    [-67, -67, 6, 'air'],
    [-67, 67, 10, 'muscle'],
  ];
  for (const [x, y, rr, t] of ins) s.push(structure('ek-' + t, -1000, 3000, (_z, out) => out.push({ shape: ell(x, y, rr, rr), p: props(t) })));
  s.push(structure('iyot', -1000, 3000, (_z, out) => out.push({ shape: ell(67, -67, 12, 12), p: { ...props('water'), tissue: 'iyot 10 mg/mL', ch: new Float32Array([1, 0, 0.01, 0]) } })));
  // çözünürlük: küçük kemik noktaları (1–4 mm)
  [1, 1.5, 2, 3, 4].forEach((d, i) => s.push(structure('nokta', -1000, 3000, (_z, out) => out.push({ shape: ell(-30 + i * 14, 40, d / 2, d / 2), p: props('corticalBone') }))));
  if (metal)
    for (const x of [-42, 42]) s.push(structure('çelik çubuk', -1000, 3000, (_z, out) => out.push({ shape: ell(x, -30, 4, 4), p: { ch: new Float32Array([0, 0, 0, 7.87]), tissue: 'çelik' } })));
  return new PhantomModel(s);
}
