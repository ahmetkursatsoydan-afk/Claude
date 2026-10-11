/**
 * Hasta masası: karbon fiber beşik (köpük çekirdekli sandviç), minder ve kafa tutucu.
 * BT görüntülerinde hastanın altında ince çift kavisli çizgi olarak görünür.
 */
import { ell, props, structure } from '../primitives';
import type { Structure } from '../types';
import { CRADLE_TOP_Y, TABLE_TOP_Y } from '../types';

export const TABLE_HALF_WIDTH = 215;
export const HEAD_HOLDER_Z1 = 235;

export function table(): Structure[] {
  const pCarbon = props('carbonFiber');
  const pFoam = props('foam');
  const out: Structure[] = [];
  out.push(
    structure('masa beşiği', -420, 2100, (z, o) => {
      if (z < HEAD_HOLDER_Z1) {
        // kafa tutucu: U şeklinde karbon kabuk + yastık
        const cy = 30;
        o.push({ shape: ell(0, cy, 104, 120, 0, 2.2), p: pCarbon, clip: [{ nx: 0, ny: -1, d: -64 }] });
        o.push({ shape: ell(0, cy, 99.5, 115.5, 0, 2.2), p: props('air'), clip: [{ nx: 0, ny: -1, d: -64 }] });
        o.push({ shape: ell(0, cy, 99, 115, 0, 2.2), p: pFoam, clip: [{ nx: 0, ny: -1, d: -82 }] });
        // beşik uzantısı (dar)
        o.push({ shape: ell(0, CRADLE_TOP_Y + 10, 120, 8, 0, 4), p: pCarbon });
        o.push({ shape: ell(0, CRADLE_TOP_Y + 10, 117, 6, 0, 4), p: pFoam });
        return;
      }
      o.push({ shape: ell(0, TABLE_TOP_Y + 20, TABLE_HALF_WIDTH - 5, 20, 0, 6), p: pFoam });
      // beşik hafif içbükey: iki kavis
      o.push({ shape: ell(0, CRADLE_TOP_Y + 10, TABLE_HALF_WIDTH, 10, 0, 4), p: pCarbon });
      o.push({ shape: ell(0, CRADLE_TOP_Y + 10, TABLE_HALF_WIDTH - 3, 8, 0, 4), p: pFoam });
    }),
  );
  return out;
}
