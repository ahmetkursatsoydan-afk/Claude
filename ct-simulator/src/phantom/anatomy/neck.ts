/**
 * Boyun: larinks (tiroid/krikoid kıkırdak, epiglot), hiyoid, tiroid bezi,
 * sternokleidomastoid ve kayış kasları, yağ planları, prevertebral kaslar.
 */
import { ell, ellipsoid, props, seg, smoothPath, structure, tube } from '../primitives';
import type { Structure } from '../types';

export function neck(): Structure[] {
  const out: Structure[] = [];
  const pFat = props('fat');
  const pMus = props('muscle', { comp: 'muscle' });
  for (const s of [-1, 1]) {
    // posterior üçgen yağı
    out.push(ellipsoid('posterior servikal yağ', { c: [s * 44, 30, 262], r: [11, 13, 30] }, pFat));
    // SCM (yağ kılıfı ile)
    const scm = smoothPath([[s * 56, 44, 150, 9], [s * 50, 20, 200, 10], [s * 44, -6, 250, 10.5], [s * 34, -34, 290, 9], [s * 22, -58, 314, 7]]);
    out.push(tube('SCM yağ kılıfı', scm.map((p) => [p[0], p[1], p[2], p[3] + 2.2] as [number, number, number, number]), pFat));
    out.push(tube('sternokleidomastoid', scm, pMus));
    // karotis kılıfı yağı
    out.push(tube('karotis kılıfı', smoothPath([[s * 27, 4, 312, 13], [s * 28, 6, 270, 13], [s * 29, 8, 230, 12]]), pFat));
    // kayış kasları
    out.push(ellipsoid('kayış kasları', { c: [s * 14, -34, 285], r: [8, 4, 30] }, pMus));
    // tiroid lobu
    out.push(ellipsoid('tiroid lobu', { c: [s * 19, -10, 288], r: [9, 12, 19] }, props('thyroid', { comp: 'thyroid' })));
    // longus kolli
    out.push(ellipsoid('longus kolli', { c: [s * 10, 24, 250], r: [6, 4, 50] }, pMus));
  }
  out.push(ellipsoid('tiroid istmusu', { c: [0, -22, 290], r: [10, 4, 6] }, props('thyroid', { comp: 'thyroid' })));
  // hiyoid
  out.push(tube('hiyoid', smoothPath([[-22, -20, 238, 3], [-12, -32, 238, 3.2], [0, -36, 238, 3.4], [12, -32, 238, 3.2], [22, -20, 238, 3]]), props('corticalBone')));
  // epiglot ve vallekula
  out.push(ellipsoid('vallekula', { c: [0, -24, 236], r: [10, 4, 5] }, props('air')));
  out.push(ellipsoid('epiglot', { c: [0, -18, 240], r: [9, 2, 9] }, props('cartilage')));
  // tiroid kıkırdağı (V şekli) + larinks hava yolu
  out.push(
    structure('tiroid kıkırdağı', 244, 272, (z, o) => {
      const w = z < 250 ? 18 : 20;
      for (const s of [-1, 1]) o.push({ shape: seg(0, -42, s * w, -16, 2.2), p: props('cartilageCalc') });
      o.push({ shape: ell(0, -24, z > 255 && z < 262 ? 3 : 7, 9), p: props('air') });
      // vokal kordlar
      if (z > 255 && z < 262) for (const s of [-1, 1]) o.push({ shape: seg(s * 2, -36, s * 10, -14, 2.5), p: props('muscle') });
    }),
  );
  out.push(
    structure('krikoid', 270, 280, (_z, o) => {
      o.push({ shape: ell(0, -16, 12, 12), p: props('cartilageCalc') });
      o.push({ shape: ell(0, -16, 9.5, 9.5), p: props('air') });
    }),
  );
  return out;
}
