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
