/** Tarama odası: zemin, duvarlar, tavan aydınlatması, kumanda odası penceresi, kapı ve ışınlama lambası, dolaplar, enjektör. */
import * as THREE from 'three';
import { ceilingTexture, floorTexture, signTexture, wallTexture, screenTexture } from './textures';

export interface RoomParts {
  group: THREE.Group;
  lampMat: THREE.MeshStandardMaterial;
  injector: THREE.Group;
}

export const ROOM = { x0: -4.2, x1: 4.2, z0: -3.2, z1: 6.4, h: 3.0 };

export function buildRoom(): RoomParts {
  const g = new THREE.Group();
  g.name = 'room';
  const W = ROOM.x1 - ROOM.x0, D = ROOM.z1 - ROOM.z0;
  const cx = (ROOM.x0 + ROOM.x1) / 2, cz = (ROOM.z0 + ROOM.z1) / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.55, metalness: 0.0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  g.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: ceilingTexture(), roughness: 0.9 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, ROOM.h, cz);
  g.add(ceil);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.85 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: '#5f8fae', roughness: 0.7 });
  const addWall = (w: number, x: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ROOM.h), wallMat);
    m.position.set(x, ROOM.h / 2, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    g.add(m);
    const st = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.12), stripeMat);
    st.position.set(x, 1.0, z);
    st.rotation.y = ry;
    st.translateZ(0.003);
    g.add(st);
    const sk = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.1), new THREE.MeshStandardMaterial({ color: '#7b8792' }));
    sk.position.set(x, 0.05, z);
    sk.rotation.y = ry;
    sk.translateZ(0.003);
    g.add(sk);
  };
  addWall(W, cx, ROOM.z0, 0);
  addWall(W, cx, ROOM.z1, Math.PI);
  addWall(D, ROOM.x1, cz, -Math.PI / 2);
  {
    // pencereli duvar (x0): yerel u = z ekseni boyunca
    const wz = 2.4, ww = 2.6, wh = 1.15, wy = 1.55;
    const sh = new THREE.Shape();
    sh.moveTo(-D / 2, -ROOM.h / 2);
    sh.lineTo(D / 2, -ROOM.h / 2);
    sh.lineTo(D / 2, ROOM.h / 2);
    sh.lineTo(-D / 2, ROOM.h / 2);
    sh.lineTo(-D / 2, -ROOM.h / 2);
    const hole = new THREE.Path();
    const u0 = -(wz - cz) - ww / 2, v0 = wy - ROOM.h / 2 - wh / 2;
    hole.moveTo(u0, v0);
    hole.lineTo(u0, v0 + wh);
    hole.lineTo(u0 + ww, v0 + wh);
    hole.lineTo(u0 + ww, v0);
    hole.lineTo(u0, v0);
    sh.holes.push(hole);
    const wgeo = new THREE.ShapeGeometry(sh);
    const uv = wgeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + D / 2) / D, (uv.getY(i) + ROOM.h / 2) / ROOM.h);
    const wm = new THREE.Mesh(wgeo, wallMat);
    wm.rotation.y = Math.PI / 2;
    wm.position.set(ROOM.x0, ROOM.h / 2, cz);
    wm.receiveShadow = true;
    g.add(wm);
    const sk = new THREE.Mesh(new THREE.PlaneGeometry(D, 0.1), new THREE.MeshStandardMaterial({ color: '#7b8792' }));
    sk.rotation.y = Math.PI / 2;
    sk.position.set(ROOM.x0 + 0.003, 0.05, cz);
    g.add(sk);
    // kumanda odası iç hacmi
    const cr = new THREE.Mesh(new THREE.BoxGeometry(1.6, ROOM.h, 4.0), new THREE.MeshStandardMaterial({ color: '#39434c', roughness: 0.9, side: THREE.BackSide }));
    cr.position.set(ROOM.x0 - 0.8, ROOM.h / 2, wz);
    g.add(cr);
    const crLight = new THREE.PointLight('#bcd7ff', 1.2, 3, 2);
    crLight.position.set(ROOM.x0 - 0.8, 2.4, wz);
    g.add(crLight);
  }

  // Tavan panelleri (yayıcı) + ışıklar
  const panelMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fffaf0', emissiveIntensity: 1.4 });
  const panels: [number, number][] = [
    [-1.6, 0.4], [1.6, 0.4], [-1.6, 2.6], [1.6, 2.6], [0, 4.8], [-1.6, -1.8], [1.6, -1.8],
  ];
  for (const [x, z] of panels) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.58), panelMat);
    p.rotation.x = Math.PI / 2;
    p.position.set(x, ROOM.h - 0.005, z);
    g.add(p);
  }

  // Kumanda odası penceresi (x0 duvarı)
  const winZ = 2.4, winW = 2.6, winH = 1.15, winY = 1.55;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.08, winH + 0.12, winW + 0.12), new THREE.MeshStandardMaterial({ color: '#c8cdd2', roughness: 0.5 }));
  frame.position.set(ROOM.x0 + 0.02, winY, winZ);
  g.add(frame);
  // pencere arkası: kumanda odası (koyu, ekranlar)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), new THREE.MeshStandardMaterial({ color: '#1b2229', roughness: 0.9 }));
  back.rotation.y = Math.PI / 2;
  back.position.set(ROOM.x0 - 0.9, winY, winZ);
  g.add(back);
  const desk = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, winW - 0.3), new THREE.MeshStandardMaterial({ color: '#8a7b68', roughness: 0.7 }));
  desk.position.set(ROOM.x0 - 0.45, 0.98, winZ);
  g.add(desk);
  const mon = screenTexture((c, w, h) => {
    c.fillStyle = '#0e1a24';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#26445a';
    c.fillRect(0, 0, w, 30);
    c.fillStyle = '#9fd8ff';
    c.font = '20px monospace';
    c.fillText('SIM-CT  Konsol', 10, 22);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = `rgba(160,170,180,${0.2 + 0.1 * i})`;
      c.beginPath();
      c.ellipse(80 + (i % 3) * 160, 110 + Math.floor(i / 3) * 120, 60, 45, 0, 0, Math.PI * 2);
      c.fill();
    }
  });
  for (let i = -1; i <= 1; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.34), new THREE.MeshBasicMaterial({ map: mon.texture }));
    m.rotation.y = Math.PI / 2;
    m.position.set(ROOM.x0 - 0.62, 1.28, winZ + i * 0.62);
    g.add(m);
  }
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(winW, winH),
    new THREE.MeshPhysicalMaterial({ color: '#9fb6c4', transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.0, transmission: 0.0 }),
  );
  glass.rotation.y = Math.PI / 2;
  glass.position.set(ROOM.x0 + 0.03, winY, winZ);
  g.add(glass);
  // pencere kenar açıklığı (duvarda boşluk izlenimi için koyu çerçeve içi)
  // Kapı (z1 duvarı) ve ışınlama lambası
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.15, 0.06), new THREE.MeshStandardMaterial({ color: '#a7b4bf', roughness: 0.5, metalness: 0.2 }));
  door.position.set(2.6, 1.075, ROOM.z1 - 0.03);
  g.add(door);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.05), new THREE.MeshStandardMaterial({ color: '#555', metalness: 0.8, roughness: 0.3 }));
  handle.position.set(2.15, 1.05, ROOM.z1 - 0.08);
  g.add(handle);
  const lampMat = new THREE.MeshStandardMaterial({ color: '#661010', emissive: '#ff2a1a', emissiveIntensity: 0.0 });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.06), lampMat);
  lamp.position.set(2.6, 2.4, ROOM.z1 - 0.04);
  g.add(lamp);
  const lampLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.12), new THREE.MeshBasicMaterial({ map: signTexture(['IŞINLAMA VAR'], '#3a0606', '#ffb0a0', false), transparent: true, opacity: 0.9 }));
  lampLabel.rotation.y = Math.PI;
  lampLabel.position.set(2.6, 2.4, ROOM.z1 - 0.075);
  g.add(lampLabel);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.315), new THREE.MeshStandardMaterial({ map: signTexture(['RADYASYON', 'KONTROLLÜ ALAN']) }));
  sign.rotation.y = Math.PI;
  sign.position.set(1.0, 1.6, ROOM.z1 - 0.01);
  g.add(sign);
  // dolaplar + tezgah (x1 duvarı)
  const cab = new THREE.MeshStandardMaterial({ color: '#dfe5ea', roughness: 0.5 });
  const top = new THREE.MeshStandardMaterial({ color: '#7d8a96', roughness: 0.4 });
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.88, 0.6), cab);
    c.position.set(ROOM.x1 - 0.31, 0.44, 1.0 + i * 0.62);
    c.castShadow = c.receiveShadow = true;
    g.add(c);
    const u = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.7, 0.6), cab);
    u.position.set(ROOM.x1 - 0.19, 2.1, 1.0 + i * 0.62);
    g.add(u);
  }
  const counter = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.04, 2.5), top);
  counter.position.set(ROOM.x1 - 0.32, 0.9, 1.93);
  g.add(counter);
  // önlük askısı
  for (let i = 0; i < 3; i++) {
    const apron = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.95, 0.5), new THREE.MeshStandardMaterial({ color: ['#2f5d8a', '#5a3d7a', '#2f7a5d'][i], roughness: 0.8 }));
    apron.position.set(ROOM.x1 - 0.06, 1.35, -1.6 + i * 0.12);
    apron.rotation.y = 0.15;
    g.add(apron);
  }
  // Kontrast enjektörü (tavan/ayak tipi)
  const injector = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 16), new THREE.MeshStandardMaterial({ color: '#c0c6cc', metalness: 0.7, roughness: 0.3 }));
  pole.position.y = 0.65;
  injector.add(pole);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.05, 5), new THREE.MeshStandardMaterial({ color: '#59626b' }));
  foot.position.y = 0.03;
  injector.add(foot);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.34), new THREE.MeshStandardMaterial({ color: '#e9edf0', roughness: 0.4 }));
  head.position.set(0, 1.32, 0);
  head.rotation.x = -0.6;
  injector.add(head);
  for (const s of [-1, 1]) {
    const syr = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 16), new THREE.MeshPhysicalMaterial({ color: '#f5f0dd', transparent: true, opacity: 0.6 }));
    syr.position.set(s * 0.05, 1.33, 0.12);
    syr.rotation.x = Math.PI / 2 - 0.6;
    injector.add(syr);
  }
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), new THREE.MeshBasicMaterial({ color: '#2a8fd4' }));
  scr.position.set(0, 1.38, -0.12);
  scr.rotation.x = -0.6;
  scr.rotation.y = Math.PI;
  injector.add(scr);
  injector.position.set(-0.78, 0, 1.55);
  injector.visible = false;
  g.add(injector);
  return { group: g, lampMat, injector };
}
