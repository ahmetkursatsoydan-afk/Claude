/** Küçük, yeniden kullanılabilir arayüz kontrolleri. */
import { useEffect, useState, type ReactNode } from 'react';

export function Section({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="section">
      <h4>
        {title}
        {right && <span style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }}>{right}</span>}
      </h4>
      <div className="body">{children}</div>
    </div>
  );
}

export function Row({ label, children, title }: { label: ReactNode; children: ReactNode; title?: string }) {
  return (
    <div className="row" title={title}>
      <label>{label}</label>
      <div className="grow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

export function Slider({ value, min, max, step = 1, unit, onChange, disabled, log }: { value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; disabled?: boolean; log?: boolean }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(value)), [value]);
  const toPos = (v: number) => (log ? (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min)) : (v - min) / (max - min));
  const fromPos = (p: number) => (log ? Math.exp(Math.log(min) + p * (Math.log(max) - Math.log(min))) : min + p * (max - min));
  const snap = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const commit = (s: string) => {
    const v = parseFloat(s.replace(',', '.'));
    if (isFinite(v)) onChange(snap(v));
    else setTxt(String(value));
  };
  return (
    <div className="slider">
      <input type="range" min={0} max={1000} value={Math.round(toPos(value) * 1000)} disabled={disabled} onChange={(e) => onChange(snap(fromPos(Number(e.target.value) / 1000)))} />
      <input className="num" value={txt} disabled={disabled} onChange={(e) => setTxt(e.target.value)} onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commit((e.target as HTMLInputElement).value)} />
      {unit !== undefined && <span className="unit">{unit}</span>}
    </div>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, disabled }: { value: T; options: { v: T; l: ReactNode; title?: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={String(o.v)} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)} disabled={disabled} title={o.title}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string | number>({ value, options, onChange, disabled }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <select className="sel" value={String(value)} disabled={disabled} onChange={(e) => onChange(options.find((o) => String(o.v) === e.target.value)!.v)}>
      {options.map((o) => (
        <option key={String(o.v)} value={String(o.v)}>
          {o.l}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ value, onChange, label, disabled }: { value: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', width: 'auto' }}>
      <input type="checkbox" checked={value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
      {label && <span style={{ color: 'var(--text)', fontSize: 12 }}>{label}</span>}
    </label>
  );
}

export function Stat({ label, value, unit }: { label: string; value: ReactNode; unit?: string }) {
  return (
    <div className="stat">
      <div className="l">{label}</div>
      <div className="v">
        {value} {unit && <small>{unit}</small>}
      </div>
    </div>
  );
}

export function Progress({ value, xray }: { value: number; xray?: boolean }) {
  return (
    <div className={'progress' + (xray ? ' x' : '')}>
      <div style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

/** Basılı tutuldukça tekrarlayan düğme (masa kontrolü). */
export function HoldButton({ onStart, onEnd, children, title }: { onStart: () => void; onEnd: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      title={title}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        onStart();
      }}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      onLostPointerCapture={onEnd}
    >
      {children}
    </button>
  );
}
