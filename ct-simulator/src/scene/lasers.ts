/**
 * Konumlandırma lazerleri: dış (gantri önü) aksiyel çizgi, sagittal ve koronal düzlemler,
 * iç (tarama düzlemi) aksiyel çizgi. Malzeme gölgelendiricisine dünya koordinatında
 * düzlem–yüzey kesişimi olarak enjekte edilir; böylece çizgiler hasta/masa yüzeyinde
 * gerçekçi biçimde kıvrılır.
 */
import * as THREE from 'three';
import { GANTRY_FRONT_Z, H_ISO, LASER_EXT_Z } from './dims';

export const laserUniforms = {
  uLaserOn: { value: 1 },
  uLaserZ: { value: LASER_EXT_Z },
  uIsoY: { value: H_ISO },
  uFrontZ: { value: GANTRY_FRONT_Z },
  uInternal: { value: 0 },
};

export function withLasers<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, laserUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLaserW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvLaserW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vLaserW;
uniform float uLaserOn; uniform float uLaserZ; uniform float uIsoY; uniform float uFrontZ; uniform float uInternal;
float laserLine(float d, float w){ float fw = fwidth(d); return 1.0 - smoothstep(w, w + fw * 1.5 + 1e-5, abs(d)); }`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
if (uLaserOn > 0.5) {
  float w = 0.0011;
  float l = 0.0;
  // dış aksiyel lazer (gantri önü), dar yelpaze
  l = max(l, laserLine(vLaserW.z - uLaserZ, w) * step(abs(vLaserW.x), 0.42) * step(0.3, vLaserW.y));
  // sagittal (orta hat) – gantri önünden masaya doğru
  l = max(l, laserLine(vLaserW.x, w) * step(uFrontZ, vLaserW.z) * step(vLaserW.z, uFrontZ + 1.35) * step(0.3, vLaserW.y));
  // koronal (izomerkez yüksekliği) – yanlardan
  l = max(l, laserLine(vLaserW.y - uIsoY, w) * step(uFrontZ, vLaserW.z) * step(vLaserW.z, uFrontZ + 1.35));
  // iç aksiyel lazer (tarama düzlemi)
  l = max(l, uInternal * laserLine(vLaserW.z, w) * step(length(vLaserW.xy - vec2(0.0, uIsoY)), 0.42));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.08, 0.05) * 1.6, l * 0.92);
}`,
      );
  };
  return m;
}
