/**
 * Motorize hasta masası: zemin kaidesi, teleskopik kaldırma kolonu, sabit taşıyıcı,
 * kayan karbon fiber beşik, minder ve kafa tutucu.
 */
import * as THREE from 'three';
import { CRADLE_FOOT_Z_P, CRADLE_HEAD_Z_P, TABLE_BASE_Z } from './dims';
import { mattressTexture } from './textures';
import { withLasers } from './lasers';

export interface TableParts {
  group: THREE.Group;
  lift: THREE.Mesh;
  support: THREE.Group;
  cradle: THREE.Group;
}

export function buildTable(): TableParts {
  const group = new THREE.Group();
  group.name = 'table';
  const shell = new THREE.MeshPhysicalMaterial({ color: '#eef1f4', roughness: 0.35, clearcoat: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2d3339', roughness: 0.5, metalness: 0.2 });
  // kaide
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 1.25), shell);
  base.position.set(0, 0.06, TABLE_BASE_Z);
  group.add(base);
  // kaldırma kolonu (ölçeklenir)
  const lift = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1, 0.62), shell);
  lift.position.set(0, 0.5, TABLE_BASE_Z + 0.1);
  group.add(lift);
  const liftBellow = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.64), dark);
  liftBellow.position.set(0, 0.14, TABLE_BASE_Z + 0.1);
  group.add(liftBellow);
  // sabit taşıyıcı (masa üst gövdesi)
  const support = new THREE.Group();
  const sup = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.09, 1.95), shell);
  sup.position.set(0, -0.075, TABLE_BASE_Z - 0.15);
  support.add(sup);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.02, 1.95), dark);
  rail.position.set(0, -0.03, TABLE_BASE_Z - 0.15);
  support.add(rail);
  group.add(support);
  // kayan beşik (yerel z: hasta z/1000)
  const cradle = new THREE.Group();
  const carbon = withLasers(new THREE.MeshPhysicalMaterial({ color: '#2a2e33', roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2, metalness: 0.1 }));
  const len = (CRADLE_FOOT_Z_P - 120) / 1000;
  const bodyShape = new THREE.Shape();
  const w = 0.43;
  bodyShape.moveTo(-w / 2, 0);
  bodyShape.quadraticCurveTo(0, -0.03, w / 2, 0);
  bodyShape.lineTo(w / 2, -0.018);
  bodyShape.quadraticCurveTo(0, -0.05, -w / 2, -0.018);
  bodyShape.lineTo(-w / 2, 0);
  const board = new THREE.Mesh(new THREE.ExtrudeGeometry(bodyShape, { depth: len, bevelEnabled: false }), carbon);
  board.position.z = 0.12;
  cradle.add(board);
  // kafa tutucu uzantısı (dar, eğri)
  const hhShape = new THREE.Shape();
  const hw = 0.25;
  hhShape.moveTo(-hw / 2, 0.06);
  hhShape.quadraticCurveTo(-hw / 2, -0.02, 0, -0.02);
  hhShape.quadraticCurveTo(hw / 2, -0.02, hw / 2, 0.06);
  hhShape.lineTo(hw / 2 - 0.012, 0.06);
  hhShape.quadraticCurveTo(hw / 2 - 0.012, -0.008, 0, -0.008);
  hhShape.quadraticCurveTo(-hw / 2 + 0.012, -0.008, -hw / 2 + 0.012, 0.06);
  hhShape.lineTo(-hw / 2, 0.06);
  const hh = new THREE.Mesh(new THREE.ExtrudeGeometry(hhShape, { depth: (120 - CRADLE_HEAD_Z_P) / 1000 - 0.1, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004 }), carbon);
  hh.position.z = CRADLE_HEAD_Z_P / 1000;
  cradle.add(hh);
  // minder
  const mat = withLasers(new THREE.MeshStandardMaterial({ map: mattressTexture(), roughness: 0.8 }));
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.04, len - 0.04, 1, 1, 1), mat);
  mattress.position.set(0, 0.02, 0.12 + len / 2);
  cradle.add(mattress);
  group.add(cradle);
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });
  return { group, lift, support, cradle };
}
