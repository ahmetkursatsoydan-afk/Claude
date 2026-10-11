import { useApp, type Step, type ViewMode } from '../state/store';

const STEPS: { id: Step; l: string }[] = [
  { id: 'patient', l: '1 Hasta' },
  { id: 'position', l: '2 Konumlandırma' },
  { id: 'topogram', l: '3 Topogram' },
  { id: 'plan', l: '4 Planlama' },
  { id: 'scan', l: '5 Tarama' },
  { id: 'review', l: '6 İnceleme' },
];

const VIEWS: { id: ViewMode; l: string }[] = [
  { id: 'room', l: 'Tarama Odası' },
  { id: 'viewer', l: 'Görüntüler' },
  { id: 'physics', l: 'Fizik & Veri' },
];

export function TopBar() {
  const { step, view, set, scan, series } = useApp();
  const idx = STEPS.findIndex((s) => s.id === step);
  return (
    <div className="topbar">
      <div className="brand">
        <b>SIM-CT 256</b>
        <span>Çok kesitli BT simülatörü</span>
      </div>
      <div className="edu-badge" title="Bu uygulama gerçek bir BT cihazını kontrol etmez ve X-ışını üretmez. Tüm anatomik görüntüler analitik/prosedürel sentetik fantomdan üretilir; klinik tanı amaçlı değildir.">
        EĞİTİM AMAÇLI SİMÜLASYON · SENTETİK ANATOMİ
      </div>
      <div className="steps">
        {STEPS.map((s, i) => (
          <div key={s.id} className={'step' + (i < idx ? ' done' : i === idx ? ' active' : '')}>
            {s.l}
          </div>
        ))}
      </div>
      <div className="views">
        <span className="dose-chip">
          DLP <b>{scan.dlpAccum.toFixed(0)}</b> mGy·cm · seri <b>{series.length}</b>
        </span>
        {VIEWS.map((v) => (
          <button key={v.id} className={'vbtn' + (view === v.id ? ' active' : '')} onClick={() => set({ view: v.id })}>
            {v.l}
          </button>
        ))}
      </div>
    </div>
  );
}
