/**
 * Sentetik tam vücut (verteks → ayak) BT fantomunun montajı.
 * Yapılar ressam algoritması sırasıyla eklenir (sonraki, öncekinin üzerine çizer).
 *
 * ÖNEMLİ: Bu fantom gerçek hasta verisi DEĞİLDİR; eğitim amaçlı, analitik/prosedürel
 * olarak üretilmiş yaklaşık bir anatomik modeldir.
 */
import { PhantomModel } from './raster';
import type { PhantomConfig, Structure } from './types';
import { arms, bodyWall, diaphragm, legs, mediastinumFat, trunkMuscles } from './anatomy/body';
import { spine } from './anatomy/spine';
import { airways, esophagus, greatVessels, heart, lungTrees, lymphNodes, thoraxBones } from './anatomy/thorax';
import { abdomen } from './anatomy/abdomen';
import { pelvis } from './anatomy/pelvis';
import { head } from './anatomy/head';
import { neck } from './anatomy/neck';
import { table } from './anatomy/table';
import { implants } from './anatomy/implants';

/** Solunumla hareket eden yapılar için katsayı ata. */
function moving(list: Structure[], k: number): Structure[] {
  for (const s of list) s.motion = k;
  return list;
}

export function buildPhantom(cfg: PhantomConfig): PhantomModel {
  const h = head(cfg);
  const s: Structure[] = [
    ...table(),
    ...arms(cfg),
    ...legs(cfg),
    ...h.soft,
    ...bodyWall(cfg),
    ...moving(diaphragm(), 1),
    ...moving(lungTrees(cfg), 0.6),
    ...mediastinumFat(),
    ...neck(),
    ...trunkMuscles(),
    ...moving(abdomen(cfg), 0.85),
    ...pelvis(cfg),
    ...moving(heart(), 0.3),
    ...greatVessels(),
    ...airways(),
    ...esophagus(),
    ...lymphNodes(),
    ...thoraxBones(cfg),
    ...spine(),
    ...h.bone,
    ...h.brain,
    ...h.face,
    ...implants(cfg),
  ];
  return new PhantomModel(s);
}

export * from './types';
