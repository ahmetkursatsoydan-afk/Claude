/** Oda, gantri ve masa boyutları (metre) – gerçek çok kesitli BT sistemlerine yakın oranlar. */
export const H_ISO = 1.0; // izomerkez yüksekliği
export const BORE_R = 0.39; // 78 cm gantri açıklığı
export const GANTRY_W = 2.24;
export const GANTRY_H = 2.02;
export const GANTRY_DEPTH = 0.92;
export const GANTRY_FRONT_Z = GANTRY_DEPTH / 2;
export const LASER_EXT_Z = GANTRY_FRONT_Z + 0.04; // dış konumlandırma lazeri
export const SOURCE_R = 0.57; // odak–izomerkez
export const DETECTOR_R = 0.47; // izomerkez–dedektör
export const FAN_HALF_ANGLE = Math.atan(0.25 / 0.57); // 50 cm SFOV

export const TABLE_BASE_Z = 2.15; // kaide merkezi
export const TABLE_MIN_H = 0.48;
export const TABLE_MAX_H = 0.96;
export const TABLE_SCAN_MIN_H = 0.7; // gantri içine girmek için asgari yükseklik (kilit)
export const CRADLE_HEAD_Z_P = -420; // beşiğin baş ucu (hasta z, mm)
export const CRADLE_FOOT_Z_P = 2080;
/** masa pozisyonu T: tarama düzlemindeki hasta z (mm) */
export const T_LOAD = -1170;
export const T_MIN = -1170;
export const T_MAX = 1750;
export const TABLE_V_SPEED = 0.035; // m/s
export const TABLE_H_SPEED = 160; // mm/s (manuel/konumlandırma)
export const TOPO_SPEED = 150; // mm/s

/** hasta y (mm) → dünya Y: beşik üstü h (m) iken */
export const CRADLE_TOP_Y_MM = 164;
export function worldY(yp: number, h: number): number {
  return h + (CRADLE_TOP_Y_MM - yp) / 1000;
}
export function worldZ(zp: number, T: number): number {
  return (zp - T) / 1000;
}
/** İzomerkezdeki hasta y koordinatı */
export function isoYp(h: number): number {
  return CRADLE_TOP_Y_MM - (H_ISO - h) * 1000;
}
/** Hasta merkezi (yp) izomerkeze gelsin diye gereken masa yüksekliği */
export function heightForCenter(yp: number): number {
  return H_ISO - (CRADLE_TOP_Y_MM - yp) / 1000;
}
