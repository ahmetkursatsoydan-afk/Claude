/** Prosedürel (canvas) dokular – harici varlık dosyası gerektirmez. */
import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat?: [number, number], srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function rand(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export function floorTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 1024);
  const r = rand(7);
  g.fillStyle = '#c9c6bd';
  g.fillRect(0, 0, 1024, 1024);
  // vinil benekleri
  for (let i = 0; i < 9000; i++) {
    const v = 150 + Math.floor(r() * 80);
    g.fillStyle = `rgba(${v},${v - 4},${v - 12},${0.25 + r() * 0.35})`;
    g.fillRect(r() * 1024, r() * 1024, 1 + r() * 3, 1 + r() * 3);
  }
  // karo derzleri (60 cm)
  g.strokeStyle = 'rgba(90,88,80,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * 256, 0);
    g.lineTo(i * 256, 1024);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i * 256);
    g.lineTo(1024, i * 256);
    g.stroke();
  }
  return tex(c, [3.4, 3.4]);
}

export function wallTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const r = rand(3);
  g.fillStyle = '#e9ebe8';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 3000; i++) {
    const v = 220 + Math.floor(r() * 30);
    g.fillStyle = `rgba(${v},${v},${v},0.25)`;
    g.fillRect(r() * 512, r() * 512, 2, 2);
  }
  return tex(c, [4, 2]);
}

export function ceilingTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#f2f2ef';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(150,150,150,0.5)';
  g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * 128, 0);
    g.lineTo(i * 128, 512);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i * 128);
    g.lineTo(512, i * 128);
    g.stroke();
  }
  return tex(c, [4, 4]);
}

export function signTexture(lines: string[], bg = '#ffd400', fg = '#111', trefoil = true): THREE.CanvasTexture {
  const [c, g] = canvas(512, 384);
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 384);
  g.strokeStyle = fg;
  g.lineWidth = 10;
  g.strokeRect(10, 10, 492, 364);
  if (trefoil) {
    g.save();
    g.translate(256, 140);
    g.fillStyle = fg;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, 85, ((k * 120 - 90 - 30) * Math.PI) / 180, ((k * 120 - 90 + 30) * Math.PI) / 180);
      g.closePath();
      g.fill();
    }
    g.fillStyle = bg;
    g.beginPath();
    g.arc(0, 0, 24, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = fg;
    g.beginPath();
    g.arc(0, 0, 16, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.fillStyle = fg;
  g.font = 'bold 40px Arial, sans-serif';
  g.textAlign = 'center';
  lines.forEach((l, i) => g.fillText(l, 256, (trefoil ? 285 : 140) + i * 46));
  return tex(c);
}

export function labelTexture(text: string, sub: string, w = 1024, h = 160): THREE.CanvasTexture {
  const [c, g] = canvas(w, h);
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#2c3a4a';
  g.font = 'bold 74px "Segoe UI", Arial, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(text, 20, h * 0.42);
  g.fillStyle = '#5b6b7c';
  g.font = '36px "Segoe UI", Arial, sans-serif';
  g.fillText(sub, 24, h * 0.82);
  return tex(c);
}

export function detectorTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 64);
  g.fillStyle = '#1b1f24';
  g.fillRect(0, 0, 512, 64);
  for (let i = 0; i < 64; i++) {
    g.fillStyle = i % 2 ? '#3d4b57' : '#2e3a44';
    g.fillRect(i * 8 + 1, 4, 6, 56);
    g.fillStyle = '#b87333';
    g.fillRect(i * 8 + 2, 54, 4, 6);
  }
  return tex(c);
}

export function screenTexture(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w = 512, h = 320): { texture: THREE.CanvasTexture; redraw: () => void } {
  const [c, g] = canvas(w, h);
  const t = tex(c);
  const redraw = () => {
    draw(g, w, h);
    t.needsUpdate = true;
  };
  redraw();
  return { texture: t, redraw };
}

export function mattressTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 1024);
  g.fillStyle = '#4d5f73';
  g.fillRect(0, 0, 256, 1024);
  const r = rand(11);
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(255,255,255,${r() * 0.05})`;
    g.fillRect(r() * 256, r() * 1024, 2, 2);
  }
  g.strokeStyle = 'rgba(20,30,40,0.5)';
  g.lineWidth = 3;
  for (let y = 0; y < 1024; y += 170) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y);
    g.stroke();
  }
  return tex(c);
}
