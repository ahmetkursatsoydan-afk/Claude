import { useEffect } from 'react';
import { useApp } from './state/store';
import { machine, onMachineUi, startMachineLoop } from './app/machine';
import { TopBar } from './ui/TopBar';
import { RoomView } from './ui/RoomView';
import { ViewerWorkspace } from './ui/viewer/ViewerWorkspace';
import { PhysicsView } from './ui/physics/PhysicsView';
import { StatusBar } from './ui/StatusBar';
import * as controller from './app/controller';

// Otomasyon/test kancası (konsoldan erişim için)
(window as unknown as Record<string, unknown>).__simct = { useApp, machine, controller };

export default function App() {
  const view = useApp((s) => s.view);
  useEffect(() => {
    startMachineLoop();
    return onMachineUi(() => {
      const m = machine;
      useApp.setState({
        hw: { tableH: m.tableH, tableT: m.tableT, rotor: m.rotorSpeed, beam: m.beam, lasers: m.lasers, cover: m.cover, interlock: m.interlockMsg, patientT: m.patientT },
      });
    });
  }, []);
  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <div style={{ position: 'absolute', inset: 0, visibility: view === 'room' ? 'visible' : 'hidden' }}>
          <RoomView active={view === 'room'} />
        </div>
        {view === 'viewer' && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <ViewerWorkspace />
          </div>
        )}
        {view === 'physics' && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <PhysicsView />
          </div>
        )}
      </div>
      <StatusBar />
    </div>
  );
}
