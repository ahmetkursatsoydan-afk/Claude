/**
 * Batın: karaciğer (hepatik/portal venler), safra kesesi, dalak, mide (hava-sıvı seviyesi),
 * duodenum, pankreas, böbrekler (korteks/medulla/sinüs/pelvis), üreterler, adrenaller,
 * ince barsak ansları, kolon ve mezenterik damarlar.
 */
import { axisEllipsoid, ell, ellipsoid, ellipsoidSection, props, smoothPath, structure, tube, tubeSections, type TubePt } from '../primitives';
import type { HalfPlane, Paint, PaintProps, PhantomConfig, Shape2D, Structure } from '../types';
import { mulberry } from './common';

const liverTex = { kind: 'noise' as const, amp: 0.012, scale: 5, seed: 71 };

export function liver(): Structure[] {
  const p = props('liver', { comp: 'liver', tex: liverTex });
  const out: Structure[] = [];
  out.push(ellipsoid('karaciğer sağ lob', { c: [-64, 14, 592], r: [86, 88, 88], rot: [0, 0, -8] }, p));
  out.push(ellipsoid('karaciğer segment 4', { c: [-16, -26, 560], r: [46, 42, 52] }, p));
  out.push(ellipsoid('karaciğer sol lob', { c: [34, -34, 548], r: [64, 30, 40], rot: [0, 0, -14] }, p));
  out.push(ellipsoid('kaudat lob', { c: [-6, 24, 572], r: [16, 17, 28] }, p));
  // ligamentum teres fissürü (yağ)
  out.push(tube('lig. teres fissürü', [[6, -52, 560, 2.5], [-4, -30, 575, 2.5], [-8, -12, 590, 2.2]], props('fat')));
  // hepatik venler
  const hv = props('blood', { comp: 'hepaticVein' });
  out.push(tube('sağ hepatik ven', smoothPath([[-24, 30, 508, 6], [-58, 18, 518, 5], [-96, 0, 535, 3.5], [-118, -12, 555, 2]]), hv));
  out.push(tube('orta hepatik ven', smoothPath([[-22, 26, 508, 5], [-36, -10, 522, 4.5], [-46, -48, 545, 2.8]]), hv));
  out.push(tube('sol hepatik ven', smoothPath([[-18, 26, 506, 4.5], [4, -12, 515, 4], [30, -40, 525, 2.5]]), hv));
  // portal ven ve dalları
  const pv = props('blood', { comp: 'portal' });
  out.push(tube('ana portal ven', smoothPath([[6, 24, 618, 7.5], [-14, 16, 604, 7], [-32, 10, 592, 6.5]]), pv));
  out.push(tube('sağ portal ven', smoothPath([[-32, 10, 592, 6], [-60, 10, 588, 5], [-84, 16, 596, 4], [-104, 22, 612, 2.6]]), pv));
  out.push(tube('sağ ön portal dal', smoothPath([[-60, 10, 588, 4], [-80, -14, 572, 3], [-96, -30, 560, 2]]), pv));
  out.push(tube('sol portal ven', smoothPath([[-32, 10, 592, 5], [-14, -8, 578, 4.5], [8, -28, 566, 3.8], [36, -36, 556, 2.4]]), pv));
  // hepatik arter
  out.push(tube('hepatik arter', smoothPath([[5, -2, 588, 2.6], [-18, 2, 592, 2.4], [-34, 4, 590, 2]]), props('blood', { comp: 'artery' })));
  // safra kesesi
  out.push(ellipsoid('safra kesesi duvarı', axisEllipsoid([-48, -44, 625], [-0.1, -0.45, 0.88], [36, 16, 14]), props('bowelWall')));
  out.push(ellipsoid('safra kesesi', axisEllipsoid([-48, -44, 625], [-0.1, -0.45, 0.88], [34.5, 14.5, 12.5]), props('bile')));
  return out;
}

export function spleen(): Structure[] {
  return [
    ellipsoid('dalak', { c: [88, 56, 562], r: [24, 52, 48], rot: [0, 0, 34] }, props('spleen', { comp: 'spleen', tex: { kind: 'noise', amp: 0.006, scale: 6, seed: 73 } })),
    tube('splenik ven', smoothPath([[78, 52, 590, 4.6], [44, 22, 602, 4.8], [10, 22, 612, 5.2], [6, 24, 618, 6]]), props('blood', { comp: 'portal' })),
    tube('splenik arter', smoothPath([[5, 14, 586, 2.8], [30, 10, 588, 2.6], [56, 28, 582, 2.6], [78, 46, 580, 2.4]]), props('blood', { comp: 'artery' })),
  ];
}

/** Tüp + iç lümen (sıvı) + bağımlı olmayan kısımda gaz (hava-sıvı seviyesi). */
function hollowViscus(name: string, pts: TubePt[], wall: PaintProps, fluid: PaintProps, gas: PaintProps | null, wallMm: number, gasLevelY: number | null): Structure {
  let zMin = Infinity, zMax = -Infinity;
  for (const q of pts) {
    zMin = Math.min(zMin, q[2] - q[3]);
    zMax = Math.max(zMax, q[2] + q[3]);
  }
  const shapes: Shape2D[] = [];
  const clips: (HalfPlane[] | undefined)[] = [];
  const gasClip: HalfPlane = { nx: 0, ny: 1, d: gasLevelY ?? -1e9 };
  return structure(name, zMin, zMax, (z, o: Paint[]) => {
    shapes.length = 0;
    clips.length = 0;
    tubeSections(pts, z, 0, shapes, clips);
    for (let i = 0; i < shapes.length; i++) o.push({ shape: shapes[i], p: wall, clip: clips[i] });
    shapes.length = 0;
    clips.length = 0;
    tubeSections(pts, z, -wallMm, shapes, clips);
    for (let i = 0; i < shapes.length; i++) {
      o.push({ shape: shapes[i], p: fluid, clip: clips[i] });
      if (gas && gasLevelY !== null) o.push({ shape: shapes[i], p: gas, clip: [...(clips[i] ?? []), gasClip] });
    }
  });
}

export function stomachAndDuodenum(): Structure[] {
  const wall = props('stomachWall', { comp: 'stomachWall', tex: { kind: 'noise', amp: 0.02, scale: 2, seed: 75 } });
  const fluid = props('bowelFluid');
  const gas = props('bowelGas');
  const stomach = smoothPath([
    [52, 34, 524, 30],
    [64, 6, 548, 32],
    [62, -24, 572, 29],
    [46, -46, 594, 24],
    [18, -56, 610, 19],
    [-8, -48, 614, 13],
    [-28, -34, 612, 12],
  ], 3);
  const duo = smoothPath([
    [-28, -34, 612, 12],
    [-46, -12, 626, 11],
    [-50, 14, 648, 11],
    [-34, 28, 668, 11],
    [-4, 28, 674, 10.5],
    [22, 24, 664, 10.5],
    [34, 12, 648, 10],
  ], 3);
  return [
    hollowViscus('mide', stomach, wall, fluid, gas, 4, -8),
    hollowViscus('duodenum', duo, props('bowelWall', { comp: 'bowelWall' }), fluid, gas, 2.5, -30),
  ];
}

export function pancreas(): Structure[] {
  const p = props('pancreas', { comp: 'pancreas', tex: { kind: 'noise', amp: 0.035, scale: 2.2, seed: 77 } });
  return [
    tube('pankreas', smoothPath([
      [-30, 12, 640, 15],
      [-22, 6, 626, 14],
      [-4, -4, 614, 10],
      [24, 2, 604, 11],
      [52, 18, 596, 10.5],
      [74, 38, 590, 9],
      [84, 46, 588, 7],
    ], 3), p),
    tube('ana pankreatik kanal', smoothPath([[-24, 8, 632, 1.2], [0, -2, 614, 1.2], [40, 8, 600, 1.1], [70, 34, 592, 1]]), props('water')),
    // SMV / SMA
    tube('SMV', smoothPath([[6, 24, 618, 6], [8, 4, 640, 5.5], [6, -16, 680, 5], [2, -28, 720, 4]]), props('blood', { comp: 'portal' })),
    tube('çölyak trunkus', smoothPath([[4, 16, 584, 3.6], [5, 2, 584, 3.4]]), props('blood', { comp: 'artery' })),
    tube('SMA', smoothPath([[4, 18, 600, 4], [6, 4, 615, 4], [9, -8, 640, 3.6], [10, -22, 690, 3], [8, -30, 730, 2.4]]), props('blood', { comp: 'artery' })),
  ];
}

export function kidneys(): Structure[] {
  const out: Structure[] = [];
  const defs: [number, [number, number, number], [number, number, number]][] = [
    [1, [74, 62, 618], [0.16, 0.26, 0.95]],
    [-1, [-72, 66, 634], [-0.16, 0.26, 0.95]],
  ];
  for (const [s, c, dir] of defs) {
    out.push(ellipsoid('perirenal yağ', axisEllipsoid([c[0], c[1], c[2]], dir, [66, 36, 30]), props('fat', { tex: { kind: 'noise', amp: 0.03, scale: 3, seed: 79 } })));
    out.push(ellipsoid('böbrek korteksi', axisEllipsoid(c, dir, [54, 27, 22], s * 20), props('kidney', { comp: 'kidneyCortex' })));
    // medulla piramitleri
    const pyr: [number, number][] = [[-38, 0], [-20, 0.8], [0, 1], [20, 0.8], [38, 0]];
    for (const [t, w] of pyr) {
      const pc: [number, number, number] = [c[0] + dir[0] * t + s * 3, c[1] + dir[1] * t + 3, c[2] + dir[2] * t];
      out.push(ellipsoid('medulla', { c: pc, r: [9 + w * 2, 8, 9] }, props('kidneyMedulla', { comp: 'kidneyMedulla' })));
    }
    // renal sinüs yağı ve pelvis (medial-anterior)
    const sc: [number, number, number] = [c[0] - s * 12, c[1] - 6, c[2] + 4];
    out.push(ellipsoid('renal sinüs', { c: sc, r: [11, 12, 26] }, props('fat')));
    out.push(ellipsoid('renal pelvis', { c: [sc[0] - s * 4, sc[1] - 2, sc[2] + 6], r: [7, 6, 12] }, props('urine', { comp: 'collecting' })));
    // üreter
    out.push(
      tube('üreter', smoothPath([
        [sc[0] - s * 8, sc[1], sc[2] + 18, 3],
        [s * 44, 40, 680, 2.4],
        [s * 40, 30, 740, 2.2],
        [s * 46, 28, 800, 2.2],
        [s * 40, 6, 850, 2.2],
        [s * 18, -12, 868, 2],
      ]), props('urine', { comp: 'collecting' })),
    );
    // renal arter / ven
    out.push(tube('renal arter', smoothPath([[s * 8, 30, 612, 3.2], [s * 30, 46, 615, 3], [c[0] - s * 18, c[1] - 6, c[2] + 2, 2.6]]), props('blood', { comp: 'artery' })));
    if (s > 0) out.push(tube('sol renal ven', smoothPath([[c[0] - 18, c[1] - 10, c[2], 5], [36, 28, 616, 5], [6, 10, 614, 4.5], [-16, 26, 615, 5]]), props('blood', { comp: 'ivcSupra' })));
    else out.push(tube('sağ renal ven', smoothPath([[c[0] + 18, c[1] - 10, c[2], 5], [-30, 34, 622, 5.5], [-20, 30, 620, 6]]), props('blood', { comp: 'ivcSupra' })));
    // adrenal
    const ap = props('adrenal', { comp: 'adrenal' });
    if (s > 0) {
      out.push(tube('sol adrenal', smoothPath([[44, 38, 560, 2.8], [48, 50, 578, 2.4], [54, 58, 592, 1.8]]), ap));
      out.push(tube('sol adrenal', smoothPath([[44, 38, 560, 2.6], [38, 56, 582, 2.2]]), ap));
    } else {
      out.push(tube('sağ adrenal', smoothPath([[-30, 40, 556, 2.8], [-36, 54, 574, 2.4], [-40, 64, 588, 1.8]]), ap));
    }
  }
  return out;
}

export function bowel(cfg: PhantomConfig): Structure[] {
  const out: Structure[] = [];
  const rnd = mulberry(cfg.seed * 977 + 3);
  const wall = props('bowelWall', { comp: 'bowelWall' });
  const fluid = props('bowelFluid');
  const gas = props('bowelGas');
  const feces = props('feces', { tex: { kind: 'mottle', amp: 1, scale: 3.2, seed: 81, thr: 0.18 } });
  // Kolon
  const colon = smoothPath([
    [-88, -6, 785, 28],
    [-98, 18, 740, 26],
    [-104, 24, 690, 25],
    [-100, 6, 650, 24],
    [-84, -30, 640, 23],
    [-50, -62, 668, 22],
    [0, -72, 690, 21],
    [52, -62, 662, 22],
    [88, -18, 610, 22],
    [96, 22, 600, 21],
    [100, 36, 650, 20],
    [98, 32, 720, 19],
    [86, 16, 778, 18],
    [52, -14, 805, 17],
    [12, -22, 796, 16],
    [-14, 12, 808, 16],
    [-4, 66, 826, 19],
    [0, 82, 860, 20],
    [0, 76, 895, 15],
    [0, 66, 925, 9],
  ], 3);
  out.push(hollowViscus('kolon', colon, wall, feces, gas, 2.5, -50));
  // İnce barsak ansları
  const nLoops = 16;
  for (let L = 0; L < nLoops; L++) {
    let x = -70 + rnd() * 140, y = -70 + rnd() * 90, z = 655 + rnd() * 150;
    const pts: TubePt[] = [];
    let ang = rnd() * Math.PI * 2, angZ = (rnd() - 0.5) * 1.2;
    const r = 10 + rnd() * 3;
    for (let k = 0; k < 10; k++) {
      pts.push([x, y, z, r]);
      ang += (rnd() - 0.5) * 1.6;
      angZ = Math.max(-1.1, Math.min(1.1, angZ + (rnd() - 0.5) * 0.9));
      const step = 20;
      x += Math.cos(ang) * step * Math.cos(angZ);
      y += Math.sin(ang) * step * Math.cos(angZ) * 0.8;
      z += Math.sin(angZ) * step;
      x = Math.max(-95, Math.min(95, x));
      y = Math.max(-82, Math.min(40, y));
      z = Math.max(640, Math.min(840, z));
    }
    const gassy = rnd() < 0.25;
    out.push(hollowViscus('ince barsak', smoothPath(pts, 3), wall, gassy ? gas : fluid, gassy ? null : gas, 2, gassy ? null : -60 - rnd() * 10));
  }
  // mezenterik damarlar
  for (let k = 0; k < 10; k++) {
    const z0 = 640 + k * 14;
    const tx = (rnd() - 0.5) * 140, ty = -40 - rnd() * 30;
    out.push(tube('mezenterik arter', smoothPath([[8, -12 - k, z0, 1.6], [(8 + tx) / 2, (ty - 12) / 2, z0 + 8, 1.3], [tx, ty, z0 + 16, 0.9]]), props('blood', { comp: 'artery' })));
    out.push(tube('mezenterik ven', smoothPath([[4, -18 - k, z0 + 3, 2], [(4 + tx) / 2 + 4, (ty - 18) / 2, z0 + 11, 1.6], [tx + 5, ty + 2, z0 + 19, 1.1]]), props('blood', { comp: 'portal' })));
  }
  return out;
}

export function abdomen(cfg: PhantomConfig): Structure[] {
  return [...bowel(cfg), ...stomachAndDuodenum(), ...liver(), ...spleen(), ...pancreas(), ...kidneys()];
}

export { ell, ellipsoidSection };
