import { mkdirSync as __mk } from 'node:fs';
__mk(process.env.OUT ?? 'out/', { recursive: true });
import { tubeSpectrum, meanEnergy, hvlAl, effectiveEnergyFromHvl, totalPhotons, airKerma } from '../src/physics/spectrum';
import { TISSUES, TISSUE_IDS, compositionToChannels, monoHU, linearAtten, massAtten } from '../src/physics/materials';
for (const kv of [70, 80, 100, 120, 140, 150]) {
  const s = tubeSpectrum(kv);
  const h = hvlAl(s);
  console.log(kv, 'mean', meanEnergy(s).toFixed(1), 'HVL', h.toFixed(2), 'Eeff', effectiveEnergyFromHvl(h).toFixed(1), 'N', totalPhotons(s).toFixed(3), 'K', airKerma(s).toFixed(4));
}
for (const id of TISSUE_IDS) {
  const c = compositionToChannels(TISSUES[id].comp);
  const direct = (e:number)=> 1000*(linearAtten(TISSUES[id].comp, e)-massAtten('water',e))/massAtten('water',e);
  console.log(id.padEnd(16), c.map(v=>v.toFixed(4)).join(' '), 'HU60', monoHU(c,60).toFixed(0), 'HU70', monoHU(c,70).toFixed(0), 'direct70', direct(70).toFixed(0), 'HU50', monoHU(c,50).toFixed(0));
}
