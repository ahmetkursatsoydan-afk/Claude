/**
 * Gantri: kaplamalar (açıklık, eğimli kenarlar), ön çerçeve + LED halkası, kontrol panelleri,
 * dönen kısım (rotor): X-ışını tüpü, kolimatör, yüksek gerilim jeneratörü, eğri dedektör dizisi,
 * DAS kartları, karşı ağırlık, kayar halka; X-ışını yelpaze demeti (görselleştirme).
 */
import * as THREE from 'three';
import { BORE_R, DETECTOR_R, FAN_HALF_ANGLE, GANTRY_DEPTH, GANTRY_H, GANTRY_W, H_ISO, SOURCE_R } from './dims';
import { detectorTexture, labelTexture, screenTexture } from './textures';
import { withLasers } from './lasers';

export interface GantryParts {
  group: THREE.Group;
  rotor: THREE.Group;
  coverMats: THREE.MeshPhysicalMaterial[];
  led: THREE.MeshStandardMaterial;
  fan: THREE.Mesh;
  fanMat: THREE.MeshBasicMaterial;
  fanGlow: THREE.Mesh;
  display: { redraw: () => void; setInfo: (lines: string[], status: string, color: string) => void };
}

function roundedRectShape(w: number, h: number, r: number, cx: number, cy: number): THREE.Shape {
  const s = new THREE.Shape();
  const x0 = cx - w / 2, y0 = cy - h / 2;
  s.moveTo(x0 + r, y0);
  s.lineTo(x0 + w - r, y0);
  s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + h - r);
  s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  s.lineTo(x0 + r, y0 + h);
  s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

export function buildGantry(): GantryParts {
  const group = new THREE.Group();
  group.name = 'gantry';
  const white = new THREE.MeshPhysicalMaterial({ color: '#f4f6f8', roughness: 0.32, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const grey = new THREE.MeshPhysicalMaterial({ color: '#b9c1ca', roughness: 0.45, metalness: 0.05, clearcoat: 0.3 });
  const coverMats = [white, grey];
  // Ana kaplama (açıklıklı yuvarlak dikdörtgen)
  const shape = roundedRectShape(GANTRY_W - 0.08, GANTRY_H - 0.1, 0.42, 0, H_ISO + 0.0);
  const hole = new THREE.Path();
  hole.absarc(0, H_ISO, BORE_R + 0.05, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const depth = GANTRY_DEPTH - 0.08;
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 6, curveSegments: 64 });
  geo.translate(0, 0, -depth / 2);
  const housing = new THREE.Mesh(geo, white);
  housing.castShadow = true;
  housing.receiveShadow = true;
  group.add(housing);
  // ön gri panel bandı (açıklık çevresinde dairesel ön yüz)
  const ringShape = new THREE.Shape();
  ringShape.absarc(0, 0, 0.64, 0, Math.PI * 2, false);
  const rh = new THREE.Path();
  rh.absarc(0, 0, BORE_R + 0.05, 0, Math.PI * 2, true);
  ringShape.holes.push(rh);
  const ringGeo = new THREE.ExtrudeGeometry(ringShape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 4, curveSegments: 96 });
  const frontRing = new THREE.Mesh(ringGeo, grey);
  frontRing.position.set(0, H_ISO, depth / 2 + 0.035);
  group.add(frontRing);
  // LED halkası
  const led = new THREE.MeshStandardMaterial({ color: '#2fb8ff', emissive: '#2fb8ff', emissiveIntensity: 1.2, roughness: 0.4 });
  const ledRing = new THREE.Mesh(new THREE.TorusGeometry(0.655, 0.008, 12, 160), led);
  ledRing.position.set(0, H_ISO, depth / 2 + 0.05);
  group.add(ledRing);
  // açıklık iç yüzeyi
  const boreMat = withLasers(new THREE.MeshStandardMaterial({ color: '#e8ebee', roughness: 0.55, side: THREE.BackSide }));
  const bore = new THREE.Mesh(new THREE.CylinderGeometry(BORE_R + 0.05, BORE_R + 0.05, GANTRY_DEPTH + 0.02, 96, 1, true), boreMat);
  bore.rotation.x = Math.PI / 2;
  bore.position.y = H_ISO;
  group.add(bore);
  // dar şeffaf pencere çizgisi (tarama düzlemi işareti)
  const planeMark = new THREE.Mesh(new THREE.TorusGeometry(BORE_R + 0.049, 0.0035, 6, 160), new THREE.MeshStandardMaterial({ color: '#30353c', roughness: 0.6 }));
  planeMark.position.y = H_ISO;
  group.add(planeMark);
  // logo
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.097), new THREE.MeshBasicMaterial({ map: labelTexture('SIM-CT 256', 'Eğitim Simülatörü · Sentetik veri'), transparent: true }));
  logo.position.set(0, H_ISO + 0.78, depth / 2 + 0.042);
  group.add(logo);
  // kontrol panelleri (masa yüksekliği/pozisyon ekranı)
  let info: string[] = ['MASA  ---', 'POZ   ---'];
  let status = 'HAZIR';
  let statusColor = '#3ee07a';
  const scr = screenTexture((g, w, h) => {
    g.fillStyle = '#0b1218';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#18303f';
    g.fillRect(0, 0, w, 56);
    g.fillStyle = statusColor;
    g.font = 'bold 40px monospace';
    g.fillText(status, 16, 42);
    g.fillStyle = '#bfe8ff';
    g.font = '34px monospace';
    info.forEach((l, i) => g.fillText(l, 16, 104 + i * 46));
  });
  for (const s of [-1, 1]) {
    const panel = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.03), new THREE.MeshStandardMaterial({ color: '#2b3138', roughness: 0.5 }));
    panel.add(body);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.106), new THREE.MeshBasicMaterial({ map: scr.texture }));
    screen.position.z = 0.016;
    panel.add(screen);
    panel.position.set(s * 0.78, H_ISO + 0.12, depth / 2 + 0.06);
    panel.rotation.y = -s * 0.25;
    group.add(panel);
    // dokunmatik tuşlar
    for (let i = 0; i < 3; i++) {
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 16), new THREE.MeshStandardMaterial({ color: i === 1 ? '#e04848' : '#7f8a96', roughness: 0.4 }));
      btn.rotation.x = Math.PI / 2;
      btn.position.set(s * 0.78 + (i - 1) * 0.05, H_ISO - 0.0, depth / 2 + 0.07);
      group.add(btn);
    }
  }
  // kaide
  const base = new THREE.Mesh(new THREE.BoxGeometry(GANTRY_W * 0.82, 0.08, GANTRY_DEPTH * 1.1), new THREE.MeshStandardMaterial({ color: '#8e98a3', roughness: 0.6 }));
  base.position.y = 0.04;
  base.receiveShadow = true;
  group.add(base);

  // ---------------- Rotor ----------------
  const rotor = new THREE.Group();
  rotor.position.y = H_ISO;
  group.add(rotor);
  const metal = new THREE.MeshStandardMaterial({ color: '#9aa4ae', roughness: 0.35, metalness: 0.75 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: '#4a525b', roughness: 0.45, metalness: 0.6 });
  const disk = new THREE.Mesh(new THREE.RingGeometry(0.47, 0.92, 96), new THREE.MeshStandardMaterial({ color: '#7d8791', roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide }));
  disk.position.z = -0.2;
  rotor.add(disk);
  // kayar halka
  const slip = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.018, 10, 128), new THREE.MeshStandardMaterial({ color: '#b87333', roughness: 0.3, metalness: 0.9 }));
  slip.position.z = -0.24;
  rotor.add(slip);
  // X-ışını tüpü (eksen teğetsel)
  const tube = new THREE.Group();
  const housingT = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.44, 32), metal);
  housingT.rotation.z = Math.PI / 2;
  tube.add(housingT);
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.03, 32), darkMetal);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = s * 0.22;
    tube.add(cap);
  }
  const coll = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.16), new THREE.MeshStandardMaterial({ color: '#3b434c', roughness: 0.4, metalness: 0.5 }));
  coll.position.y = -0.1;
  tube.add(coll);
  const tubeLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.04), new THREE.MeshBasicMaterial({ color: '#ffcc33' }));
  tubeLabel.position.set(0, 0.0, 0.112);
  tube.add(tubeLabel);
  tube.position.y = SOURCE_R + 0.1;
  rotor.add(tube);
  // yüksek gerilim jeneratörü ve soğutucu
  const gen = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.3), new THREE.MeshStandardMaterial({ color: '#5c6670', roughness: 0.5, metalness: 0.4 }));
  gen.position.set(Math.cos(Math.PI * 0.17) * 0.72, Math.sin(Math.PI * 0.17) * 0.72, -0.05);
  gen.rotation.z = Math.PI * 0.17 - Math.PI / 2;
  rotor.add(gen);
  const cooler = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.26), new THREE.MeshStandardMaterial({ color: '#6c7884', roughness: 0.5, metalness: 0.4 }));
  cooler.position.set(-Math.cos(Math.PI * 0.17) * 0.72, Math.sin(Math.PI * 0.17) * 0.72, -0.05);
  cooler.rotation.z = -(Math.PI * 0.17 - Math.PI / 2);
  rotor.add(cooler);
  // eğri dedektör dizisi (odak noktası merkezli yay)
  const arcR = SOURCE_R + DETECTOR_R;
  const half = FAN_HALF_ANGLE + 0.04;
  // CylinderGeometry köşeleri (r sinθ, h, r cosθ); x ekseni etrafında +90° döndürülünce
  // (r sinθ, −r cosθ, h) → θ=0 doğrudan aşağı (−y) bakar. Yay odak noktası merkezlidir.
  const det = new THREE.Mesh(
    new THREE.CylinderGeometry(arcR, arcR, 0.16, 96, 1, true, -half, 2 * half),
    new THREE.MeshStandardMaterial({ map: detectorTexture(), roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }),
  );
  det.rotation.x = Math.PI / 2;
  const detGroup = new THREE.Group();
  detGroup.add(det);
  detGroup.position.y = SOURCE_R;
  rotor.add(detGroup);
  // DAS kutuları (dedektör arkası)
  for (let i = -3; i <= 3; i++) {
    const a = -Math.PI / 2 + (i / 3) * (half * 0.9);
    const das = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.2), darkMetal);
    das.position.set(Math.cos(a) * (arcR + 0.07), SOURCE_R + Math.sin(a) * (arcR + 0.07), -0.02);
    das.rotation.z = a + Math.PI / 2;
    rotor.add(das);
  }
  // karşı ağırlık blokları
  for (const s of [-1, 1]) {
    const cw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.22), new THREE.MeshStandardMaterial({ color: '#3d4650', roughness: 0.6, metalness: 0.5 }));
    const a = Math.PI + s * 0.95;
    cw.position.set(Math.sin(a) * 0.74, Math.cos(a) * 0.74, -0.06);
    cw.rotation.z = -a;
    rotor.add(cw);
  }
  // X-ışını yelpazesi (görselleştirme; gerçekte görünmez)
  const fanGeo = buildFanGeometry(SOURCE_R, SOURCE_R + DETECTOR_R, FAN_HALF_ANGLE, 32);
  const fanMat = new THREE.MeshBasicMaterial({ color: '#8fd0ff', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const fan = new THREE.Mesh(fanGeo, fanMat);
  fan.visible = false;
  fan.renderOrder = 5;
  rotor.add(fan);
  const fanGlow = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), new THREE.MeshBasicMaterial({ color: '#d9f1ff' }));
  fanGlow.position.y = SOURCE_R;
  fanGlow.visible = false;
  rotor.add(fanGlow);

  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o !== fan) o.castShadow = o.receiveShadow = true;
  });
  fan.castShadow = false;

  return {
    group,
    rotor,
    coverMats,
    led,
    fan,
    fanMat,
    fanGlow,
    display: {
      redraw: scr.redraw,
      setInfo: (lines, st, color) => {
        info = lines;
        status = st;
        statusColor = color;
        scr.redraw();
      },
    },
  };
}

/** Odak noktasından dedektöre uzanan, z yönünde genişleyen (koni) yelpaze. Birim genişlik. */
function buildFanGeometry(sr: number, sid: number, halfAngle: number, n: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  // tepe (odak) – çok dar
  const apexW = 0.02;
  pos.push(0, sr, -apexW / 2, 0, sr, apexW / 2);
  for (let i = 0; i <= n; i++) {
    const a = -halfAngle + (2 * halfAngle * i) / n;
    const x = Math.sin(a) * sid, y = sr - Math.cos(a) * sid;
    const wz = (sid / sr) * 0.5; // izomerkezde 1 birim genişlik
    pos.push(x, y, -wz, x, y, wz);
  }
  for (let i = 0; i < n; i++) {
    const a = 2 + i * 2, b = a + 2;
    idx.push(0, a, b); // ön yüz
    idx.push(1, b + 1, a + 1); // arka yüz
    idx.push(a, a + 1, b + 1, a, b + 1, b); // dedektör yüzü
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
