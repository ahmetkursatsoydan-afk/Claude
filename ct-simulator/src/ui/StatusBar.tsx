import { useApp } from '../state/store';

export function StatusBar() {
  const log = useApp((s) => s.log);
  const hw = useApp((s) => s.hw);
  const last = log[log.length - 1];
  return (
    <div className="statusbar">
      <span className={'msg ' + (last?.level ?? '')}>{last?.text}</span>
      <span>
        Masa Y {(hw.tableH * 1000).toFixed(0)} mm · Z {hw.tableT.toFixed(0)} mm · Rotor {(hw.rotor * 60).toFixed(0)} rpm
      </span>
      <span style={{ color: hw.beam !== 'off' ? 'var(--xray)' : undefined }}>{hw.beam !== 'off' ? '● X-IŞINI' : '○ X-ışını kapalı'}</span>
    </div>
  );
}
