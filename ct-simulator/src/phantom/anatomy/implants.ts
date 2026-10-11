/** İsteğe bağlı metal implantlar (metal artefaktı gösterimi için). */
import { ellipsoid, ellipsoidSection, props, smoothPath, structure, tube } from '../primitives';
import type { PhantomConfig, Structure } from '../types';

export function implants(cfg: PhantomConfig): Structure[] {
  const out: Structure[] = [];
  const ti = props('titanium');
  const cocr = props('cocr');
  if (cfg.implant === 'hipRight' || cfg.implant === 'hipBilateral') {
    const sides = cfg.implant === 'hipRight' ? [-1] : [-1, 1];
    for (const s of sides) {
      // asetabular kap (Ti, yarım küre kabuk, medial)
      const cupO = ellipsoidSection({ c: [s * 88, 6, 868], r: [28, 28, 28] });
      const cupI = ellipsoidSection({ c: [s * 88, 6, 868], r: [24.5, 24.5, 24.5] });
      const clip = [{ nx: s, ny: 0, d: 96 }];
      out.push(
        structure('asetabular kap', cupO.zMin, cupO.zMax, (z, o) => {
          const a = cupO.at(z), b = cupI.at(z);
          if (a) o.push({ shape: a, p: ti, clip });
          if (b) o.push({ shape: b, p: props('plastic'), clip });
        }),
      );
      out.push(ellipsoid('protez başı (CoCr)', { c: [s * 88, 6, 868], r: [16, 16, 16] }, cocr));
      out.push(tube('femoral stem (Ti)', smoothPath([[s * 92, 6, 872, 6], [s * 112, 10, 886, 8], [s * 120, 12, 905, 8], [s * 116, 12, 960, 6.5], [s * 110, 10, 1030, 4.5]]), ti));
    }
  }
  if (cfg.implant === 'spine') {
    for (const z of [705, 743]) {
      for (const s of [-1, 1]) out.push(tube('pedikül vidası', [[s * 26, 96, z, 3.3], [s * 14, 46, z + 2, 3]], ti));
    }
    for (const s of [-1, 1]) out.push(tube('rod', [[s * 28, 98, 698, 3], [s * 28, 100, 750, 3]], ti));
  }
  return out;
}
