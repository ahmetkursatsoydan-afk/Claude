/**
 * WebGL2 kesit görüntüleyici: 16-bit tamsayı HU dokusu (R16I) doğrudan yüklenir,
 * parçacık gölgelendiricide elle bilineer enterpolasyon + pencere genişliği/seviyesi.
 * Pan/zoom ve anizotropik piksel aralığı (MPR) desteklenir.
 */
const VS = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
precision highp isampler2D;
uniform isampler2D uTex;
uniform vec2 uImg;      // görüntü boyutu (piksel)
uniform vec2 uSpacing;  // mm/piksel (x, y)
uniform vec2 uCanvas;   // tuval boyutu (piksel)
uniform float uK;       // ekran pikseli / mm
uniform vec2 uPan;      // mm
uniform float uWL;
uniform float uWW;
uniform float uInvert;
uniform float uSmooth;
out vec4 frag;
float fetch(ivec2 p){
  p = clamp(p, ivec2(0), ivec2(uImg) - 1);
  return float(texelFetch(uTex, p, 0).r);
}
void main(){
  vec2 sp = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y);
  vec2 mm = (sp - 0.5 * uCanvas) / uK - uPan;
  vec2 ip = mm / uSpacing + 0.5 * uImg - 0.5;
  if (ip.x < -0.5 || ip.y < -0.5 || ip.x > uImg.x - 0.5 || ip.y > uImg.y - 0.5) { frag = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float v;
  if (uSmooth > 0.5) {
    vec2 f = fract(ip);
    ivec2 i0 = ivec2(floor(ip));
    float a = fetch(i0), b = fetch(i0 + ivec2(1, 0)), c = fetch(i0 + ivec2(0, 1)), d = fetch(i0 + ivec2(1, 1));
    v = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  } else {
    v = fetch(ivec2(floor(ip + 0.5)));
  }
  float g = clamp((v - (uWL - 0.5 * uWW)) / max(uWW, 1.0), 0.0, 1.0);
  if (uInvert > 0.5) g = 1.0 - g;
  frag = vec4(vec3(g), 1.0);
}`;

export interface ViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export class SliceRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private w = 0;
  private h = 0;
  private dataRef: Int16Array | null = null;
  spacing: [number, number] = [1, 1];
  ok = true;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 desteklenmiyor');
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    this.prog = p;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uTex', 'uImg', 'uSpacing', 'uCanvas', 'uK', 'uPan', 'uWL', 'uWW', 'uInvert', 'uSmooth']) this.loc[n] = gl.getUniformLocation(p, n);
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  setImage(data: Int16Array, w: number, h: number, spacing: [number, number]) {
    const gl = this.gl;
    this.spacing = spacing;
    if (data === this.dataRef && w === this.w && h === this.h) return;
    this.dataRef = data;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16I, w, h, 0, gl.RED_INTEGER, gl.SHORT, data);
    this.w = w;
    this.h = h;
  }

  /** Ekran pikseli/mm ölçeği */
  scale(t: ViewTransform): number {
    const cw = this.canvas.width, ch = this.canvas.height;
    const W = this.w * this.spacing[0], H = this.h * this.spacing[1];
    if (!W || !H) return 1;
    return Math.min(cw / W, ch / H) * t.zoom;
  }

  render(t: ViewTransform, ww: number, wl: number, invert = false, smooth = true) {
    const gl = this.gl;
    const cw = this.canvas.width, ch = this.canvas.height;
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.w) return;
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.loc.uTex, 0);
    gl.uniform2f(this.loc.uImg, this.w, this.h);
    gl.uniform2f(this.loc.uSpacing, this.spacing[0], this.spacing[1]);
    gl.uniform2f(this.loc.uCanvas, cw, ch);
    gl.uniform1f(this.loc.uK, this.scale(t));
    gl.uniform2f(this.loc.uPan, t.panX, t.panY);
    gl.uniform1f(this.loc.uWL, wl);
    gl.uniform1f(this.loc.uWW, ww);
    gl.uniform1f(this.loc.uInvert, invert ? 1 : 0);
    gl.uniform1f(this.loc.uSmooth, smooth ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** ekran pikseli (css * dpr) → görüntü mm (merkez orijinli) */
  screenToMm(sx: number, sy: number, t: ViewTransform): [number, number] {
    const k = this.scale(t);
    return [(sx - this.canvas.width / 2) / k - t.panX, (sy - this.canvas.height / 2) / k - t.panY];
  }
  mmToScreen(mx: number, my: number, t: ViewTransform): [number, number] {
    const k = this.scale(t);
    return [(mx + t.panX) * k + this.canvas.width / 2, (my + t.panY) * k + this.canvas.height / 2];
  }
  get size(): [number, number] {
    return [this.w, this.h];
  }
  dispose() {
    this.gl.deleteTexture(this.tex);
    this.gl.deleteProgram(this.prog);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/** WebGL2 yoksa yedek: Canvas2D ile pencereleme (daha yavaş ama çalışır). */
export class Canvas2DRenderer {
  private g: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private data: Int16Array | null = null;
  private off = document.createElement('canvas');
  spacing: [number, number] = [1, 1];
  ok = true;
  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
  }
  setImage(data: Int16Array, w: number, h: number, spacing: [number, number]) {
    this.data = data;
    this.w = w;
    this.h = h;
    this.spacing = spacing;
  }
  scale(t: ViewTransform): number {
    const W = this.w * this.spacing[0], H = this.h * this.spacing[1];
    if (!W || !H) return 1;
    return Math.min(this.canvas.width / W, this.canvas.height / H) * t.zoom;
  }
  render(t: ViewTransform, ww: number, wl: number, invert = false) {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.data) return;
    this.off.width = this.w;
    this.off.height = this.h;
    const og = this.off.getContext('2d')!;
    const id = og.createImageData(this.w, this.h);
    const lo = wl - ww / 2;
    for (let i = 0; i < this.data.length; i++) {
      let v = Math.max(0, Math.min(255, ((this.data[i] - lo) / ww) * 255));
      if (invert) v = 255 - v;
      id.data[4 * i] = id.data[4 * i + 1] = id.data[4 * i + 2] = v;
      id.data[4 * i + 3] = 255;
    }
    og.putImageData(id, 0, 0);
    const k = this.scale(t);
    const W = this.w * this.spacing[0] * k, H = this.h * this.spacing[1] * k;
    const x = this.canvas.width / 2 + t.panX * k - W / 2, y = this.canvas.height / 2 + t.panY * k - H / 2;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.off, x, y, W, H);
  }
  screenToMm(sx: number, sy: number, t: ViewTransform): [number, number] {
    const k = this.scale(t);
    return [(sx - this.canvas.width / 2) / k - t.panX, (sy - this.canvas.height / 2) / k - t.panY];
  }
  mmToScreen(mx: number, my: number, t: ViewTransform): [number, number] {
    const k = this.scale(t);
    return [(mx + t.panX) * k + this.canvas.width / 2, (my + t.panY) * k + this.canvas.height / 2];
  }
  get size(): [number, number] {
    return [this.w, this.h];
  }
  dispose() {}
}

export type AnyRenderer = SliceRenderer | Canvas2DRenderer;
export function createRenderer(c: HTMLCanvasElement): AnyRenderer {
  try {
    return new SliceRenderer(c);
  } catch {
    return new Canvas2DRenderer(c);
  }
}
