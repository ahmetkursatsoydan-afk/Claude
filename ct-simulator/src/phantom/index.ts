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

export function buildPhantom(cfg: PhantomConfig): PhantomModel {
  const h = head(cfg);
  const s: Structure[] = [
    ...table(),
    ...arms(cfg),
    ...legs(cfg),
    ...h.soft,
    ...bodyWall(cfg),
    ...diaphragm(),
    ...lungTrees(cfg),
    ...mediastinumFat(),
    ...neck(),
    ...trunkMuscles(),
    ...abdomen(cfg),
    ...pelvis(cfg),
    ...heart(),
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
