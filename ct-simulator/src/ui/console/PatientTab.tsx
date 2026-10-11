import { useApp } from '../../state/store';
import { PROTOCOLS } from '../../sim/scan';
import { applyProtocol, isBusy, loadPatient, registerPatient, unloadPatient } from '../../app/controller';
import { Row, Section, Seg, Select } from '../controls';

export function PatientTab() {
  const { patient, params, setPatientCfg, set, hw } = useApp();
  const cfg = patient.cfg;
  const busy = isBusy();
  const loading = hw.patientT > 0.001 && hw.patientT < 0.999;
  return (
    <>
      <Section title="Protokol">
        <Select value={params.protocolId} options={PROTOCOLS.map((p) => ({ v: p.id, l: p.label }))} onChange={(v) => applyProtocol(v)} disabled={busy} />
        <div className="hint">{PROTOCOLS.find((p) => p.id === params.protocolId)?.description}</div>
      </Section>
      <Section title="Hasta kaydı (sentetik)">
        <div className="kv" style={{ marginBottom: 6 }}>
          <span>Ad Soyad</span>
          <span>SENTETİK^FANTOM</span>
          <span>Hasta ID</span>
          <span>{patient.id}</span>
          <span>Yaş / Cinsiyet</span>
          <span>
            {patient.age} / {patient.sex === 'M' ? 'E' : 'K'}
          </span>
          <span>Pozisyon</span>
          <span>Baş önde, sırtüstü (HFS)</span>
        </div>
        <Row label="Vücut yapısı">
          <Seg
            value={cfg.habitus}
            disabled={patient.onTable || busy}
            onChange={(v) => setPatientCfg({ habitus: v })}
            options={[
              { v: 'small', l: 'Zayıf', title: 'BMI ~19 – ince deri altı yağ' },
              { v: 'medium', l: 'Orta', title: 'BMI ~25' },
              { v: 'large', l: 'Obez', title: 'BMI ~35 – kalın yağ dokusu, daha fazla zayıflama' },
            ]}
          />
        </Row>
        <Row label="Kollar">
          <Seg
            value={cfg.arms}
            disabled={busy || loading}
            onChange={(v) => setPatientCfg({ arms: v })}
            options={[
              { v: 'up', l: 'Baş üstünde', title: 'Gövde taramalarında önerilir' },
              { v: 'down', l: 'Yanlarda', title: 'Baş/boyun taramalarında; gövdede çizgi artefaktı ve doz artışı' },
            ]}
          />
        </Row>
        <Row label="Metal implant">
          <Select
            value={cfg.implant}
            disabled={patient.onTable || busy}
            onChange={(v) => setPatientCfg({ implant: v })}
            options={[
              { v: 'none', l: 'Yok' },
              { v: 'hipRight', l: 'Sağ kalça protezi (Ti/CoCr)' },
              { v: 'hipBilateral', l: 'Bilateral kalça protezi' },
              { v: 'dental', l: 'Amalgam diş dolguları' },
              { v: 'spine', l: 'Lomber pedikül vidaları (L4–L5)' },
            ]}
          />
        </Row>
        <div className="hint">Anatomi tamamen sentetik ve prosedüreldir; gerçek klinik veri kullanılmaz.</div>
      </Section>
      <Section title="Hasta hazırlığı">
        <div className="btn-row">
          {!patient.registered && (
            <button className="btn" onClick={registerPatient}>
              Hastayı kaydet
            </button>
          )}
          {!patient.onTable ? (
            <button className="btn primary" disabled={busy || loading} onClick={() => void loadPatient()}>
              ⤵ Hastayı masaya yatır
            </button>
          ) : (
            <button className="btn" disabled={busy || loading} onClick={() => void unloadPatient()}>
              ⤴ Hastayı masadan indir
            </button>
          )}
          {patient.onTable && (
            <button className="btn primary" onClick={() => set({ tab: 'position' })}>
              Sonraki: Konumlandırma →
            </button>
          )}
        </div>
        <div className="hint">
          Gövde incelemelerinde kollar başın üzerine alınır (kollar yanda kalırsa omuz/batın düzeyinde foton açlığı çizgileri ve ATCM nedeniyle doz artışı olur).
          Baş BT'sinde kollar yanda olmalıdır.
        </div>
      </Section>
    </>
  );
}
