/**
 * Three.js sahne denetleyicisi: oluşturucu, kamera/kontroller, ışıklar, ortam haritası,
 * oda/gantri/masa/hasta ve her karede makine durumunun görselleştirilmesi.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { machine } from '../app/machine';
import type { PhantomConfig } from '../phantom/types';
import { buildGantry, type GantryParts } from './gantry';
import { buildTable, type TableParts } from './table';
import { buildRoom, type RoomParts } from './room';
import { buildPatientMesh } from './patient';
import { laserUniforms } from './lasers';
import { H_ISO, isoYp } from './dims';

export type CameraPreset = 'genel' | 'yan' | 'on' | 'ust' | 'gantri' | 'konsol' | 'arka';

const PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  genel: { pos: [3.3, 2.15, 4.3], target: [0, 0.95, 1.0] },
  yan: { pos: [3.6, 1.35, 1.2], target: [0, 1.0, 1.0] },
  on: { pos: [0.0, 1.55, 4.9], target: [0, 1.0, 0.4] },
  ust: { pos: [0.01, 5.6, 1.3], target: [0, 0.9, 1.3] },
  gantri: { pos: [0.85, 1.3, 1.25], target: [0, 1.0, 0.0] },
  konsol: { pos: [-4.75, 1.55, 2.4], target: [0, 1.0, 0.9] },
  arka: { pos: [-2.2, 1.9, -2.6], target: [0, 1.0, 0.3] },
};

export class SceneController {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private gantry: GantryParts;
  private table: TableParts;
  private room: RoomParts;
  private patient: THREE.Group | null = null;
  private patientStand: THREE.Group | null = null;
  private patientCfgKey = '';
  private raf = 0;
  private lastDisplay = 0;
  private camTween: { from: THREE.Vector3; to: THREE.Vector3; tf: THREE.Vector3; tt: THREE.Vector3; t: number } | null = null;
  private clock = new THREE.Clock();
  private resizeObs: ResizeObserver;
  private standQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  showBeam = true;
  /** görünür değilken çizimi durdur (GPU tasarrufu) */
  active = true;
  contrastVisible = false;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 60);
    this.camera.position.set(...PRESETS.genel.pos);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...PRESETS.genel.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 0.35;
    this.controls.maxDistance = 11;

    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.background = new THREE.Color('#d8dde2');

    // ışıklar
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#b9b2a6', 0.55));
    const key = new THREE.SpotLight('#fff6ea', 38, 14, Math.PI / 4.2, 0.55, 1.4);
    key.position.set(1.2, 2.95, 2.2);
    key.target.position.set(0, 0.8, 0.8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    this.scene.add(key, key.target);
    const fill = new THREE.SpotLight('#eef4ff', 18, 12, Math.PI / 3.5, 0.7, 1.4);
    fill.position.set(-1.6, 2.9, 3.6);
    fill.target.position.set(0, 0.9, 1.4);
    this.scene.add(fill, fill.target);
    const back = new THREE.PointLight('#ffffff', 6, 8, 1.6);
    back.position.set(0, 2.8, -2.0);
    this.scene.add(back);

    this.room = buildRoom();
    this.scene.add(this.room.group);
    this.gantry = buildGantry();
    this.scene.add(this.gantry.group);
    this.table = buildTable();
    this.scene.add(this.table.group);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();
    this.loop();
  }

  setPatient(cfg: PhantomConfig) {
    const key = JSON.stringify(cfg);
    if (key === this.patientCfgKey) return;
    this.patientCfgKey = key;
    for (const g of [this.patient, this.patientStand]) {
      if (!g) continue;
      this.scene.remove(g);
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    }
    this.patient = buildPatientMesh(cfg);
    this.scene.add(this.patient);
    // ayakta/yürürken kollar yanda
    this.patientStand = cfg.arms === 'up' ? buildPatientMesh({ ...cfg, arms: 'down' }) : null;
    if (this.patientStand) this.scene.add(this.patientStand);
  }

  setPreset(p: CameraPreset) {
    const pr = PRESETS[p];
    this.camTween = {
      from: this.camera.position.clone(),
      to: new THREE.Vector3(...pr.pos),
      tf: this.controls.target.clone(),
      tt: new THREE.Vector3(...pr.target),
      t: 0,
    };
  }

  private resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private update(dt: number, now: number) {
    const m = machine;
    const h = m.tableH;
    // masa
    const liftH = Math.max(0.05, h - 0.2);
    this.table.lift.scale.y = liftH;
    this.table.lift.position.y = 0.12 + liftH / 2;
    this.table.support.position.y = h;
    this.table.cradle.position.set(0, h, -m.tableT / 1000);
    // rotor
    this.gantry.rotor.rotation.z = m.rotorAngle;
    const on = m.beam !== 'off';
    this.gantry.fan.visible = on && this.showBeam;
    this.gantry.fanGlow.visible = on;
    this.gantry.fan.scale.z = m.beam === 'topogram' ? 0.004 : Math.max(0.01, m.beamWidth);
    this.gantry.fanMat.opacity = 0.11 + 0.05 * Math.sin(now * 0.02);
    // kaplama şeffaflığı
    const cut = m.cover === 'cutaway';
    for (const mat of this.gantry.coverMats) {
      if (mat.transparent !== cut) {
        mat.transparent = cut;
        mat.needsUpdate = true;
      }
      mat.opacity = cut ? 0.16 : 1;
      mat.depthWrite = !cut;
    }
    // LED
    if (on) {
      this.gantry.led.emissive.set('#ffb020');
      this.gantry.led.emissiveIntensity = 1.4 + 0.8 * Math.sin(now * 0.008);
    } else if (m.rotorSpeed > 0.05) {
      this.gantry.led.emissive.set('#36d07a');
      this.gantry.led.emissiveIntensity = 1.1;
    } else {
      this.gantry.led.emissive.set('#2fb8ff');
      this.gantry.led.emissiveIntensity = 1.0;
    }
    // lazerler ve lamba
    laserUniforms.uLaserOn.value = m.lasers && !on ? 1 : 0;
    laserUniforms.uInternal.value = m.lasers ? 1 : 0;
    this.room.lampMat.emissiveIntensity = m.xrayLamp ? 2.6 : 0.05;
    this.room.injector.visible = this.contrastVisible || m.injector;
    // hasta pozu
    if (this.patient) {
      const t = m.patientT;
      const lie = new THREE.Vector3(0, h, -m.tableT / 1000);
      const s0 = new THREE.Vector3(1.05, 1.79, 2.35);
      const s1 = new THREE.Vector3(0.62, 1.79, 1.45);
      const ease = (x: number) => x * x * (3 - 2 * x);
      const pos = new THREE.Vector3();
      const q = new THREE.Quaternion();
      if (t <= 0.3) {
        pos.lerpVectors(s0, s1, ease(t / 0.3));
        q.copy(this.standQ);
      } else {
        const u = ease((t - 0.3) / 0.7);
        pos.lerpVectors(s1, lie, u);
        pos.y += Math.sin(u * Math.PI) * 0.12;
        q.copy(this.standQ).slerp(new THREE.Quaternion(), u);
      }
      // kollar: masada yatarken protokol pozisyonu, ayakta yanlarda
      const lying = t > 0.985;
      const showMain = !this.patientStand || lying;
      for (const [g, vis] of [
        [this.patient, showMain],
        [this.patientStand, !showMain],
      ] as const) {
        if (!g) continue;
        g.position.copy(pos);
        g.quaternion.copy(q);
        g.visible = vis && m.patientVisible;
      }
    }
    // gantri ekranı
    if (now - this.lastDisplay > 250) {
      this.lastDisplay = now;
      const center = isoYp(h);
      const st = on ? 'X-RAY ON' : m.rotorSpeed > 0.05 ? 'ROTOR HAZIR' : 'HAZIR';
      const col = on ? '#ffb020' : '#3ee07a';
      this.gantry.display.setInfo([`MASA Y  ${(h * 1000).toFixed(0)} mm`, `MASA Z  ${m.tableT.toFixed(0)} mm`, `İZO-y   ${center.toFixed(0)} mm`, `ROTOR  ${(m.rotorSpeed * 60).toFixed(0)} rpm`], st, col);
    }
    // kamera geçişi
    if (this.camTween) {
      const c = this.camTween;
      c.t = Math.min(1, c.t + dt / 1.1);
      const e = c.t * c.t * (3 - 2 * c.t);
      this.camera.position.lerpVectors(c.from, c.to, e);
      this.controls.target.lerpVectors(c.tf, c.tt, e);
      if (c.t >= 1) this.camTween = null;
    }
    void H_ISO;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, this.clock.getDelta());
    if (!this.active) return;
    this.update(dt, performance.now());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
