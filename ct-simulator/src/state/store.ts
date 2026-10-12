/** Uygulama durumu (zustand). Büyük görüntü dizileri series.ts içinde, burada yalnızca meta veriler. */
import { create } from 'zustand';
import { DEFAULT_PHANTOM_CONFIG, type PhantomConfig } from '../phantom/types';
import { PROTOCOLS, type Breathing, type ScanParams } from '../sim/scan';

export type ViewMode = 'room' | 'viewer' | 'physics';
export type ConsoleTab = 'patient' | 'position' | 'topogram' | 'plan' | 'scan' | 'recon';
export type Step = 'patient' | 'position' | 'topogram' | 'plan' | 'scan' | 'review';

export interface TopoMeta {
  status: 'none' | 'acquiring' | 'done';
  view: 'AP' | 'LAT';
  z0: number;
  z1: number;
  kVp: number;
  mA: number;
  rows: number;
  cols: number;
  dz: number;
  dx: number;
  rowsDone: number;
  version: number;
  /** topogram alınırken masa yüksekliği/izomerkez y */
  isoYp: number;
}

export interface ScanRuntime {
  status: 'idle' | 'preparing' | 'waiting' | 'breath' | 'scanning' | 'done' | 'aborted';
  message: string;
  progress: number;
  t: number;
  currentZ: number;
  currentmA: number;
  countdown: number;
  dlpAccum: number;
  reconDone: number;
  reconTotal: number;
  reconSeriesId: string | null;
  slicesPerSec: number;
  liveVer: number;
}

export interface SeriesMeta {
  id: string;
  name: string;
  desc: string;
  created: number;
  nTotal: number;
  nDone: number;
  m: number;
  dfov: number;
  thickness: number;
  interval: number;
  kernel: string;
  recon: string;
  kVp: number;
  version: number;
}

export type Tool = 'wl' | 'pan' | 'zoom' | 'measure' | 'roi' | 'probe';
export type Layout = '1x1' | 'mpr' | '1x2';

export interface ViewportState {
  orientation: 'axial' | 'coronal' | 'sagittal' | 'scout';
  index: number;
  ww: number;
  wl: number;
  zoom: number;
  panX: number;
  panY: number;
}

export interface LogEntry {
  t: number;
  text: string;
  level: 'info' | 'warn' | 'ok';
}

export interface AppState {
  view: ViewMode;
  tab: ConsoleTab;
  step: Step;
  patient: { registered: boolean; onTable: boolean; id: string; age: number; sex: 'M' | 'F'; cfg: PhantomConfig; breathing: Breathing };
  params: ScanParams;
  topo: TopoMeta;
  scan: ScanRuntime;
  series: SeriesMeta[];
  activeSeries: string | null;
  viewer: {
    layout: Layout;
    tool: Tool;
    active: number;
    vps: ViewportState[];
    crossX: number;
    crossY: number;
    crossZ: number;
    cine: boolean;
    cineFps: number;
    slab: number;
    slabMode: 'avg' | 'mip' | 'minip';
    showOverlay: boolean;
  };
  physicsSliceZ: number | null;
  log: LogEntry[];
  /** makine durumunun arayüz kopyası */
  hw: { tableH: number; tableT: number; rotor: number; beam: string; lasers: boolean; cover: string; interlock: string; patientT: number };
  set: (p: Partial<AppState>) => void;
  setParams: (p: Partial<ScanParams>) => void;
  setPatientCfg: (p: Partial<PhantomConfig>) => void;
  setViewport: (i: number, p: Partial<ViewportState>) => void;
  setViewer: (p: Partial<AppState['viewer']>) => void;
  addLog: (text: string, level?: LogEntry['level']) => void;
  updateSeries: (id: string, p: Partial<SeriesMeta>) => void;
}

const defaultProtocol = PROTOCOLS[1];

export const useApp = create<AppState>()((set, get) => ({
  view: 'room',
  tab: 'patient',
  step: 'patient',
  patient: { registered: false, onTable: false, id: 'SIM-0001', age: 54, sex: 'M', cfg: { ...DEFAULT_PHANTOM_CONFIG, arms: defaultProtocol.arms }, breathing: 'hold' },
  params: { protocolId: defaultProtocol.id, ...defaultProtocol.params },
  topo: { status: 'none', view: 'AP', z0: defaultProtocol.topoRange[0], z1: defaultProtocol.topoRange[1], kVp: 120, mA: 40, rows: 0, cols: 0, dz: 2, dx: 1.6, rowsDone: 0, version: 0, isoYp: 0 },
  scan: { status: 'idle', message: '', progress: 0, t: 0, currentZ: 0, currentmA: 0, countdown: 0, dlpAccum: 0, reconDone: 0, reconTotal: 0, reconSeriesId: null, slicesPerSec: 0, liveVer: 0 },
  series: [],
  activeSeries: null,
  viewer: {
    layout: '1x1',
    tool: 'wl',
    active: 0,
    vps: [
      { orientation: 'axial', index: 0, ww: 400, wl: 40, zoom: 1, panX: 0, panY: 0 },
      { orientation: 'coronal', index: 0, ww: 400, wl: 40, zoom: 1, panX: 0, panY: 0 },
      { orientation: 'sagittal', index: 0, ww: 400, wl: 40, zoom: 1, panX: 0, panY: 0 },
      { orientation: 'scout', index: 0, ww: 400, wl: 40, zoom: 1, panX: 0, panY: 0 },
    ],
    crossX: 0,
    crossY: 0,
    crossZ: 0,
    cine: false,
    cineFps: 12,
    slab: 0,
    slabMode: 'avg',
    showOverlay: true,
  },
  physicsSliceZ: null,
  log: [{ t: Date.now(), text: 'Sistem hazır. Eğitim amaçlı sentetik BT simülatörü – gerçek hasta verisi kullanılmaz.', level: 'info' }],
  hw: { tableH: 0.52, tableT: -1170, rotor: 0, beam: 'off', lasers: true, cover: 'opaque', interlock: '', patientT: 0 },
  set: (p) => set(p),
  setParams: (p) => set({ params: { ...get().params, ...p } }),
  setPatientCfg: (p) => set({ patient: { ...get().patient, cfg: { ...get().patient.cfg, ...p } } }),
  setViewport: (i, p) => {
    const v = get().viewer;
    const vps = v.vps.slice();
    vps[i] = { ...vps[i], ...p };
    set({ viewer: { ...v, vps } });
  },
  setViewer: (p) => set({ viewer: { ...get().viewer, ...p } }),
  addLog: (text, level = 'info') => set({ log: [...get().log.slice(-80), { t: Date.now(), text, level }] }),
  updateSeries: (id, p) => set({ series: get().series.map((s) => (s.id === id ? { ...s, ...p } : s)) }),
}));
