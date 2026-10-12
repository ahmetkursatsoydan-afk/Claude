/**
 * WebGL2 (OffscreenCanvas) hızlandırmalı ileri izdüşüm ve geri izdüşüm.
 * Web worker içinde çalışır; EXT_color_buffer_float gerektirir. İlk kullanımda CPU
 * referansıyla öz-test yapılır; sapma varsa otomatik olarak CPU yoluna dönülür.
 */
import type { BBox } from '../phantom/raster';
import { backproject as cpuBackproject, projectJoseph, type ProjGeom, type ReconGrid } from './projector';

const FP_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uImg;
uniform float uN, uDx, uNv, uNb, uDs, uLinear;
uniform vec4 uBox;
out vec4 o;
vec4 samp(vec2 xy) {
  vec2 u = xy / uDx + (uN - 1.0) * 0.5;
  if (uLinear > 0.5) return texture(uImg, (u + 0.5) / uN);
  vec2 fl = floor(u);
  vec2 f = u - fl;
  ivec2 i = clamp(ivec2(fl), ivec2(0), ivec2(int(uN) - 2));
  vec4 a = texelFetch(uImg, i, 0), b = texelFetch(uImg, i + ivec2(1, 0), 0);
  vec4 c = texelFetch(uImg, i + ivec2(0, 1), 0), d = texelFetch(uImg, i + ivec2(1, 1), 0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main() {
  float b = floor(gl_FragCoord.x), v = floor(gl_FragCoord.y);
  float th = v * 3.141592653589793 / uNv;
  float c = cos(th), s = sin(th);
  float sb = (b - (uNb - 1.0) * 0.5) * uDs;
  vec2 org = sb * vec2(c, s);
  vec2 dir = vec2(-s, c);
  float t0 = -1e9, t1 = 1e9;
  if (abs(dir.x) > 1e-7) { float ta = (uBox.x - org.x) / dir.x, tb = (uBox.y - org.x) / dir.x; t0 = max(t0, min(ta, tb)); t1 = min(t1, max(ta, tb)); }
  else if (org.x < uBox.x || org.x > uBox.y) { o = vec4(0.0); return; }
  if (abs(dir.y) > 1e-7) { float ta = (uBox.z - org.y) / dir.y, tb = (uBox.w - org.y) / dir.y; t0 = max(t0, min(ta, tb)); t1 = min(t1, max(ta, tb)); }
  else if (org.y < uBox.z || org.y > uBox.w) { o = vec4(0.0); return; }
  if (t1 <= t0) { o = vec4(0.0); return; }
  float dt = uDx;
  int ns = int(ceil((t1 - t0) / dt));
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 16384; i++) {
    if (i >= ns) break;
    float t = t0 + (float(i) + 0.5) * dt;
    acc += samp(org + t * dir);
  }
  // son adım kısmi: kalan uzunluk ağırlığı
  float rem = (t1 - t0) - float(ns - 1) * dt;
  acc -= samp(org + (t0 + (float(ns) - 0.5) * dt) * dir) * (1.0 - rem / dt);
  o = acc * dt * 0.1;
}`;

const BP_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uQ;
uniform sampler2D uTrig;
uniform float uM, uPix, uCx, uCy, uNv, uNb, uDs;
out vec4 o;
void main() {
  float col = floor(gl_FragCoord.x), row = floor(gl_FragCoord.y);
  float hm = (uM - 1.0) * 0.5;
  float x = uCx + (col - hm) * uPix, y = uCy + (row - hm) * uPix;
  float cb = (uNb - 1.0) * 0.5;
  float acc = 0.0;
  int nv = int(uNv);
  int nbm = int(uNb) - 1;
  for (int v = 0; v < 8192; v++) {
    if (v >= nv) break;
    vec2 cs = texelFetch(uTrig, ivec2(v, 0), 0).rg;
    float t = (x * cs.x + y * cs.y) / uDs + cb;
    if (t >= 0.0 && t < float(nbm)) {
      float fi = floor(t);
      int ii = int(fi);
      float a = texelFetch(uQ, ivec2(ii, v), 0).r;
      float b = texelFetch(uQ, ivec2(ii + 1, v), 0).r;
      acc += mix(a, b, t - fi);
    }
  }
  o = vec4(acc * 3.141592653589793 / uNv, 0.0, 0.0, 1.0);
}`;

const VS = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

type GL = WebGL2RenderingContext;

export class GpuCT {
  private gl: GL;
  private fp: WebGLProgram;
  private bp: WebGLProgram;
  private linear: boolean;
  private loc = new Map<string, WebGLUniformLocation | null>();
  readonly renderer: string;

  private constructor(gl: GL) {
    this.gl = gl;
    this.linear = !!gl.getExtension('OES_texture_float_linear');
    this.fp = this.program(FP_FS);
    this.bp = this.program(BP_FS);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    for (const p of [this.fp, this.bp]) {
      const l = gl.getAttribLocation(p, 'aPos');
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
    }
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.renderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  }

  static create(): GpuCT | null {
    try {
      if (typeof OffscreenCanvas === 'undefined') return null;
      const c = new OffscreenCanvas(1, 1);
      const gl = c.getContext('webgl2', { antialias: false, depth: false, stencil: false, premultipliedAlpha: false }) as GL | null;
      if (!gl) return null;
      if (!gl.getExtension('EXT_color_buffer_float')) return null;
      return new GpuCT(gl);
    } catch {
      return null;
    }
  }

  private program(fs: string): WebGLProgram {
    const gl = this.gl;
    const sh = (t: number, src: string) => {
      const s = gl.createShader(t)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    return p;
  }

  private u(p: WebGLProgram, name: string): WebGLUniformLocation | null {
    const key = (p === this.fp ? 'f:' : 'b:') + name;
    if (!this.loc.has(key)) this.loc.set(key, this.gl.getUniformLocation(p, name));
    return this.loc.get(key)!;
  }

  private tex(w: number, h: number, internal: number, format: number, data: Float32Array | null, linear = false): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.FLOAT, data);
    const f = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private target(w: number, h: number): { fb: WebGLFramebuffer; tex: WebGLTexture } {
    const gl = this.gl;
    const tex = this.tex(w, h, gl.RGBA32F, gl.RGBA, null);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('FBO eksik');
    return { fb, tex };
  }

  /** 4 kanalı (W,B,I,M) aynı anda izdüşürür. */
  forward(chs: Float32Array[], n: number, dx: number, bb: BBox, geo: ProjGeom, outs: Float32Array[]): void {
    const gl = this.gl;
    const { nv, nb, ds } = geo;
    const inter = new Float32Array(n * n * 4);
    const [A, B, C, D] = chs;
    for (let j = bb.j0; j <= bb.j1; j++) {
      const r = j * n;
      for (let i = bb.i0; i <= bb.i1; i++) {
        const k = r + i, q = 4 * k;
        inter[q] = A[k];
        inter[q + 1] = B[k];
        inter[q + 2] = C[k];
        inter[q + 3] = D[k];
      }
    }
    const img = this.tex(n, n, gl.RGBA32F, gl.RGBA, inter, this.linear);
    const { fb, tex } = this.target(nb, nv);
    gl.useProgram(this.fp);
    gl.viewport(0, 0, nb, nv);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, img);
    gl.uniform1i(this.u(this.fp, 'uImg'), 0);
    gl.uniform1f(this.u(this.fp, 'uN'), n);
    gl.uniform1f(this.u(this.fp, 'uDx'), dx);
    gl.uniform1f(this.u(this.fp, 'uNv'), nv);
    gl.uniform1f(this.u(this.fp, 'uNb'), nb);
    gl.uniform1f(this.u(this.fp, 'uDs'), ds);
    gl.uniform1f(this.u(this.fp, 'uLinear'), this.linear ? 1 : 0);
    const c0 = (n - 1) / 2;
    gl.uniform4f(this.u(this.fp, 'uBox'), (bb.i0 - c0) * dx, (bb.i1 - c0) * dx, (bb.j0 - c0) * dx, (bb.j1 - c0) * dx);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const res = new Float32Array(nb * nv * 4);
    gl.readPixels(0, 0, nb, nv, gl.RGBA, gl.FLOAT, res);
    for (let k = 0; k < nb * nv; k++) {
      outs[0][k] = res[4 * k];
      outs[1][k] = res[4 * k + 1];
      outs[2][k] = res[4 * k + 2];
      outs[3][k] = res[4 * k + 3];
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    gl.deleteTexture(img);
  }

  backproject(q: Float32Array, geo: ProjGeom, rg: ReconGrid, out: Float32Array): void {
    const gl = this.gl;
    const { nv, nb, ds } = geo;
    const qt = this.tex(nb, nv, gl.R32F, gl.RED, q);
    const trig = new Float32Array(nv * 2);
    for (let v = 0; v < nv; v++) {
      trig[2 * v] = Math.cos((v * Math.PI) / nv);
      trig[2 * v + 1] = Math.sin((v * Math.PI) / nv);
    }
    const tt = this.tex(nv, 1, gl.RG32F, gl.RG, trig);
    const m = rg.m;
    const { fb, tex } = this.target(m, m);
    gl.useProgram(this.bp);
    gl.viewport(0, 0, m, m);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, qt);
    gl.uniform1i(this.u(this.bp, 'uQ'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tt);
    gl.uniform1i(this.u(this.bp, 'uTrig'), 1);
    gl.uniform1f(this.u(this.bp, 'uM'), m);
    gl.uniform1f(this.u(this.bp, 'uPix'), rg.pix);
    gl.uniform1f(this.u(this.bp, 'uCx'), rg.cx);
    gl.uniform1f(this.u(this.bp, 'uCy'), rg.cy);
    gl.uniform1f(this.u(this.bp, 'uNv'), nv);
    gl.uniform1f(this.u(this.bp, 'uNb'), nb);
    gl.uniform1f(this.u(this.bp, 'uDs'), ds);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const res = new Float32Array(m * m * 4);
    gl.readPixels(0, 0, m, m, gl.RGBA, gl.FLOAT, res);
    for (let k = 0; k < m * m; k++) out[k] += res[4 * k];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    gl.deleteTexture(qt);
    gl.deleteTexture(tt);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** Yazılımsal (emüle) WebGL mi? */
  get isSoftware(): boolean {
    return /swiftshader|llvmpipe|software|basic render/i.test(this.renderer);
  }

  /** GPU ve CPU'yu orta boy bir izdüşüm + geri izdüşümde karşılaştırır (ms). */
  benchmark(): { gpu: number; cpu: number } {
    const n = 320, dx = 1.2;
    const img = [0, 1, 2, 3].map(() => new Float32Array(n * n));
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = i - n / 2, y = j - n / 2;
        if (x * x + y * y < 140 * 140) img[0][j * n + i] = 1;
      }
    const bb = { i0: 10, i1: n - 11, j0: 10, j1: n - 11 };
    const geo = { nv: 240, nb: 400, ds: 1.2 };
    const outs = [0, 1, 2, 3].map(() => new Float32Array(geo.nv * geo.nb));
    const rg = { m: 256, pix: 1.4, cx: 0, cy: 0 };
    const img2 = new Float32Array(rg.m * rg.m);
    // ısınma
    this.forward(img, n, dx, bb, geo, outs);
    let t = performance.now();
    this.forward(img, n, dx, bb, geo, outs);
    this.backproject(outs[0], geo, rg, img2);
    const gpu = performance.now() - t;
    t = performance.now();
    projectJoseph([img[0], img[1]], n, dx, bb, geo, [outs[0], outs[1]]);
    cpuBackproject(outs[0], geo, rg, img2);
    const cpu = performance.now() - t;
    return { gpu, cpu };
  }

  /** CPU referansına karşı öz-test. Göreli hata < %1.5 olmalı. */
  selfTest(): { ok: boolean; fpErr: number; bpErr: number } {
    const n = 96, dx = 1.0;
    const img = [0, 1, 2, 3].map(() => new Float32Array(n * n));
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * dx, y = (j - (n - 1) / 2) * dx;
        if (x * x + y * y < 40 * 40) img[0][j * n + i] = 1;
        if ((x - 12) ** 2 + (y + 8) ** 2 < 64) img[1][j * n + i] = 0.6;
        if ((x + 15) ** 2 + (y - 10) ** 2 < 36) img[2][j * n + i] = 0.01;
      }
    const bb = { i0: 2, i1: n - 3, j0: 2, j1: n - 3 };
    const geo = { nv: 60, nb: 120, ds: 1.0 };
    const cpu = [0, 1, 2, 3].map(() => new Float32Array(geo.nv * geo.nb));
    const gpu = [0, 1, 2, 3].map(() => new Float32Array(geo.nv * geo.nb));
    projectJoseph([img[0], img[1]], n, dx, bb, geo, [cpu[0], cpu[1]]);
    this.forward(img, n, dx, bb, geo, gpu);
    let num = 0, den = 0;
    for (let k = 0; k < cpu[0].length; k++) {
      num += Math.abs(cpu[0][k] - gpu[0][k]) + Math.abs(cpu[1][k] - gpu[1][k]);
      den += Math.abs(cpu[0][k]) + Math.abs(cpu[1][k]);
    }
    const fpErr = num / Math.max(1e-9, den);
    const rg = { m: 64, pix: 1.2, cx: 3, cy: -2 };
    const a = new Float32Array(64 * 64), b = new Float32Array(64 * 64);
    cpuBackproject(cpu[0], geo, rg, a);
    this.backproject(cpu[0], geo, rg, b);
    let n2 = 0, d2 = 0;
    for (let k = 0; k < a.length; k++) {
      n2 += Math.abs(a[k] - b[k]);
      d2 += Math.abs(a[k]);
    }
    const bpErr = n2 / Math.max(1e-9, d2);
    return { ok: fpErr < 0.015 && bpErr < 0.005, fpErr, bpErr };
  }
}
