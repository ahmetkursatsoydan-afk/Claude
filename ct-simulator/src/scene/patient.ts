/**
 * 3B hasta modeli: BT fantomuyla AYNI anatomik dış hat fonksiyonlarından (gövde, baş,
 * bacak ve kol yolları) prosedürel olarak oluşturulur. Böylece masaya yatan hasta ile
 * simüle edilen görüntüler geometrik olarak tutarlıdır.
 * Yerel koordinat: X = x/1000, Y = (164 − y)/1000 (masa beşiği üstü = 0), Z = z/1000.
 */
import * as THREE from 'three';
import type { PhantomConfig } from '../phantom/types';
import { HABITUS_FAT, torsoAt } from '../phantom/anatomy/common';
import { HEAD_KEYS } from '../phantom/anatomy/head';
import { sweepSampler } from '../phantom/primitives';
import { armPath, legAt } from '../phantom/anatomy/body';
import { CRADLE_TOP_Y_MM } from './dims';
import { withLasers } from './lasers';

interface Sec {
  z: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  n: number;
  color: THREE.Color;
}

const SKIN = new THREE.Color('#d9a888');
const GOWN = new THREE.Color('#8fb4cf');
const HAIR = new THREE.Color('#3b2a20');

function P(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x / 1000, (CRADLE_TOP_Y_MM - y) / 1000, z / 1000);
}

function loft(secs: Sec[], seg = 48, colorFn?: (s: Sec, ang: number, x: number, y: number) => THREE.Color): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (const s of secs) {
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const e = 2 / s.n;
      const x = s.cx + s.rx * Math.sign(c) * Math.pow(Math.abs(c), e);
      const y = s.cy + s.ry * Math.sign(sn) * Math.pow(Math.abs(sn), e);
      const p = P(x, y, s.z);
      pos.push(p.x, p.y, p.z);
      const cc = colorFn ? colorFn(s, a, x, y) : s.color;
      col.push(cc.r, cc.g, cc.b);
    }
  }
  for (let i = 0; i < secs.length - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const a = i * seg + k, b = i * seg + ((k + 1) % seg), c = (i + 1) * seg + k, d = (i + 1) * seg + ((k + 1) % seg);
      idx.push(a, c, b, b, c, d);
    }
  }
  // uç kapakları
  const capAt = (i: number, flip: boolean) => {
    const s = secs[i];
    const ci = pos.length / 3;
    const p = P(s.cx, s.cy, s.z);
    pos.push(p.x, p.y, p.z);
    col.push(s.color.r, s.color.g, s.color.b);
    for (let k = 0; k < seg; k++) {
      const a = i * seg + k, b = i * seg + ((k + 1) % seg);
      if (flip) idx.push(ci, b, a);
      else idx.push(ci, a, b);
    }
  };
  capAt(0, false);
  capAt(secs.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Değişken yarıçaplı tüp (paralel taşıma çerçevesi). pts: hasta mm, r mm */
function tubeLoft(pts: [number, number, number, number][], color: THREE.Color, seg = 24, samples = 64): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => P(p[0], p[1], p[2])));
  const radii = pts.map((p) => p[3] / 1000);
  const frames = curve.computeFrenetFrames(samples, false);
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const c = curve.getPointAt(t);
    const u = t * (radii.length - 1);
    const k = Math.min(radii.length - 2, Math.floor(u));
    const r = radii[k] + (radii[k + 1] - radii[k]) * (u - k);
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const v = new THREE.Vector3().addScaledVector(N, Math.cos(a) * r).addScaledVector(B, Math.sin(a) * r * 0.92).add(c);
      pos.push(v.x, v.y, v.z);
      col.push(color.r, color.g, color.b);
    }
  }
  for (let i = 0; i < samples; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + ((j + 1) % seg), c2 = (i + 1) * seg + j, d = (i + 1) * seg + ((j + 1) % seg);
      idx.push(a, b, c2, b, d, c2);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildPatientMesh(cfg: PhantomConfig): THREE.Group {
  const grp = new THREE.Group();
  grp.name = 'patient';
  const k = HABITUS_FAT[cfg.habitus];
  const mat = withLasers(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.0, side: THREE.DoubleSide }));
  // gövde
  const tsecs: Sec[] = [];
  for (let z = 210; z <= 935; z += 6) {
    const L = torsoAt(z, k);
    if (!L) continue;
    tsecs.push({ z, cx: L.skin.cx, cy: L.skin.cy, rx: L.skin.rx, ry: L.skin.ry, n: L.skin.n, color: z > 296 ? GOWN : SKIN });
  }
  grp.add(new THREE.Mesh(loft(tsecs, 64), mat));
  // baş (saç: üst ve arka)
  const hs = sweepSampler(HEAD_KEYS);
  const hsecs: Sec[] = [];
  for (let z = -3; z <= 236; z += 3) {
    const r = hs.at(z);
    if (!r) continue;
    hsecs.push({ z, cx: r[0], cy: r[1], rx: r[2], ry: r[3], n: 2, color: SKIN });
  }
  grp.add(
    new THREE.Mesh(
      loft(hsecs, 56, (s, _a, _x, y) => {
        if (s.z < 22) return HAIR;
        if (s.z < 128 && y > s.cy + s.ry * (s.z < 80 ? -0.15 : 0.35)) return HAIR;
        return SKIN;
      }),
      mat,
    ),
  );
  // burun, kulaklar (köşe rengi olmayan geometriler için ayrı malzeme)
  const skinM = withLasers(new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 }));
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), skinM);
  nose.scale.set(0.012, 0.016, 0.026);
  nose.position.copy(P(0, -96, 142));
  grp.add(nose);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), skinM);
    ear.scale.set(0.006, 0.016, 0.028);
    ear.position.copy(P(s * 79, 26, 132));
    grp.add(ear);
  }
  // bacaklar
  for (const s of [-1, 1]) {
    const lsecs: Sec[] = [];
    for (let z = 896; z <= 1745; z += 10) {
      const g = legAt(z);
      if (!g) continue;
      const fat = (z < 1100 ? 14 + ((1100 - z) / 205) * 4 : z < 1300 ? 8 + ((1300 - z) / 200) * 6 : 4) * k;
      const rr = g.r - 18 + fat + 2;
      lsecs.push({ z, cx: s * g.cx, cy: Math.min(g.cy, 126 - rr), rx: rr * 1.02, ry: rr, n: 2, color: z < 1000 ? GOWN : SKIN });
    }
    grp.add(new THREE.Mesh(loft(lsecs, 40), mat));
    // ayak (ayak parmakları yukarı)
    const foot = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), skinM);
    foot.scale.set(0.045, 0.11, 0.05);
    foot.position.copy(P(s * 88, 14, 1760));
    grp.add(foot);
  }
  // kollar
  const path = armPath(cfg);
  for (const s of [-1, 1]) {
    const pts = path.map((q): [number, number, number, number] => {
      const r = q[3] - 10 + 8 * k + 2;
      return [s * q[0], q[1] + (q[3] - r) * (cfg.arms === 'down' ? 1 : 0.3), q[2], r];
    });
    grp.add(new THREE.Mesh(tubeLoft(pts, SKIN), mat));
    const end = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const hand = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), skinM);
    hand.scale.set(0.022, 0.045, 0.09);
    const dir = P(end[0], end[1], end[2]).sub(P(prev[0], prev[1], prev[2])).normalize();
    hand.position.copy(P(end[0], end[1], end[2]).addScaledVector(dir, 0.05));
    hand.lookAt(hand.position.clone().add(dir));
    grp.add(hand);
  }
  grp.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return grp;
}
