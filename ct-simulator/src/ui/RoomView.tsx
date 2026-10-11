import { useEffect, useRef, useState } from 'react';
import { SceneController, type CameraPreset } from '../scene/SceneController';
import { useApp, type ConsoleTab } from '../state/store';
import { machine } from '../app/machine';
import { HoldButton, Progress } from './controls';
import { PatientTab } from './console/PatientTab';
import { PositionTab } from './console/PositionTab';
import { TopogramTab } from './console/TopogramTab';
import { PlanTab } from './console/PlanTab';
import { ScanTab } from './console/ScanTab';
import { ReconTab } from './console/ReconTab';
import { isoYp } from '../scene/dims';

const TABS: { id: ConsoleTab; l: string }[] = [
  { id: 'patient', l: 'Hasta' },
  { id: 'position', l: 'Konum' },
  { id: 'topogram', l: 'Topogram' },
  { id: 'plan', l: 'Plan' },
  { id: 'scan', l: 'Tarama' },
  { id: 'recon', l: 'Rekon' },
];

const CAMS: { id: CameraPreset; l: string }[] = [
  { id: 'genel', l: '⌂ Genel görünüm' },
  { id: 'yan', l: '◧ Yandan' },
  { id: 'on', l: '▣ Ayak ucundan' },
  { id: 'gantri', l: '◎ Gantri yakın' },
  { id: 'ust', l: '⬒ Kuşbakışı' },
  { id: 'arka', l: '◩ Gantri arkası' },
  { id: 'konsol', l: '▤ Kumanda odası' },
];

export function RoomView({ active }: { active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const ctrl = useRef<SceneController | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const tab = useApp((s) => s.tab);
  const set = useApp((s) => s.set);
  const cfg = useApp((s) => s.patient.cfg);
  const contrast = useApp((s) => s.params.contrast);
  const hw = useApp((s) => s.hw);
  const scan = useApp((s) => s.scan);
  const params = useApp((s) => s.params);
  const [showBeam, setShowBeam] = useState(true);

  useEffect(() => {
    if (!host.current) return;
    try {
      ctrl.current = new SceneController(host.current);
    } catch (e) {
      setErr('3B görüntüleme başlatılamadı (WebGL gerekli): ' + String(e));
    }
    return () => {
      ctrl.current?.dispose();
      ctrl.current = null;
    };
  }, []);
  useEffect(() => {
    ctrl.current?.setPatient(cfg);
  }, [cfg]);
  useEffect(() => {
    if (ctrl.current) ctrl.current.contrastVisible = contrast;
  }, [contrast]);
  useEffect(() => {
    if (ctrl.current) ctrl.current.showBeam = showBeam;
  }, [showBeam]);
  useEffect(() => {
    if (ctrl.current) ctrl.current.active = active;
  }, [active]);

  const xray = hw.beam !== 'off';
  const off = isoYp(hw.tableH);
  return (
    <div className="room">
      <div className="room3d">
        <div ref={host} style={{ position: 'absolute', inset: 0 }} />
        {err && <div className="empty">{err}</div>}
        <div className="hud">
          {xray && <div className="card xray-on">☢ X-IŞINI AÇIK</div>}
          {(scan.status === 'scanning' || scan.status === 'waiting' || scan.status === 'breath' || scan.status === 'preparing') && (
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{scan.message}</div>
              {scan.status === 'scanning' && (
                <>
                  <div className="kv">
                    <span>kV / mA</span>
                    <span>
                      {params.kVp} / {scan.currentmA.toFixed(0)}
                    </span>
                    <span>Rotasyon</span>
                    <span>{params.rotTime} s</span>
                    <span>Pitch</span>
                    <span>{params.pitch}</span>
                    <span>Masa z</span>
                    <span>{scan.currentZ.toFixed(0)} mm</span>
                    <span>Süre</span>
                    <span>{scan.t.toFixed(1)} s</span>
                    <span>DLP</span>
                    <span>{scan.dlpAccum.toFixed(0)} mGy·cm</span>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <Progress value={scan.progress} xray />
                  </div>
                </>
              )}
            </div>
          )}
          {hw.interlock && <div className="card warn">{hw.interlock}</div>}
        </div>
        <div className="cam-bar">
          {CAMS.map((c) => (
            <button key={c.id} onClick={() => ctrl.current?.setPreset(c.id)}>
              {c.l}
            </button>
          ))}
          <button onClick={() => (machine.cover = machine.cover === 'opaque' ? 'cutaway' : 'opaque')}>{hw.cover === 'cutaway' ? '◐ Kapakları kapat' : '◑ Kapakları şeffaf yap'}</button>
          <button onClick={() => (machine.lasers = !machine.lasers)}>{hw.lasers ? '✳ Lazerleri kapat' : '✳ Lazerleri aç'}</button>
          <button onClick={() => setShowBeam(!showBeam)}>{showBeam ? '⚡ Demeti gizle' : '⚡ Demeti göster'}</button>
        </div>
        <div className="pad">
          <div className="lbl">MASA KONTROLÜ</div>
          <span />
          <HoldButton title="Masayı yükselt" onStart={() => (machine.manualH = 1)} onEnd={() => ((machine.manualH = 0), (machine.targetH = machine.tableH))}>
            ▲
          </HoldButton>
          <span />
          <HoldButton title="Masayı gantriye sür" onStart={() => (machine.manualT = 1)} onEnd={() => ((machine.manualT = 0), (machine.targetT = machine.tableT))}>
            ◀
          </HoldButton>
          <button title="Masayı durdur" onClick={() => ((machine.targetT = machine.tableT), (machine.targetH = machine.tableH))}>
            ■
          </button>
          <HoldButton title="Masayı dışarı çek" onStart={() => (machine.manualT = -1)} onEnd={() => ((machine.manualT = 0), (machine.targetT = machine.tableT))}>
            ▶
          </HoldButton>
          <span />
          <HoldButton title="Masayı alçalt" onStart={() => (machine.manualH = -1)} onEnd={() => ((machine.manualH = 0), (machine.targetH = machine.tableH))}>
            ▼
          </HoldButton>
          <span />
          <div className="lbl" style={{ fontFamily: 'var(--mono)' }}>
            Y {(hw.tableH * 1000).toFixed(0)} · Z {hw.tableT.toFixed(0)}
            <br />
            izo-y {off.toFixed(0)} mm
          </div>
        </div>
        <div className="disclaimer3d">Eğitim amaçlı simülasyon – gerçek cihaz kontrolü / X-ışını yoktur</div>
      </div>
      <div className="console">
        <div className="tabs">
          {TABS.map((t, i) => (
            <button key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} onClick={() => set({ tab: t.id })}>
              <span className="n">{i + 1}</span>
              {t.l}
            </button>
          ))}
        </div>
        <div className="console-body">
          {tab === 'patient' && <PatientTab />}
          {tab === 'position' && <PositionTab />}
          {tab === 'topogram' && <TopogramTab />}
          {tab === 'plan' && <PlanTab />}
          {tab === 'scan' && <ScanTab />}
          {tab === 'recon' && <ReconTab />}
        </div>
      </div>
    </div>
  );
}
