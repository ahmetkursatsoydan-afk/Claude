/** Görüntü oluşumu gezgini: kaynak (fantom/bölge) ve tarama parametreleri. */
import type { KernelId } from '../physics/kernels';

export type FormationRegion = 'qa' | 'qaMetal' | 'brain' | 'skullbase' | 'thorax' | 'abdomen' | 'pelvis';

export const REGIONS: Record<FormationRegion, { label: string; z: number; head: boolean; test?: 'qa' | 'qaMetal'; hint: string }> = {
  qa: { label: 'Eğitim fantomu', z: 0, head: false, test: 'qa', hint: '32 cm su silindiri: kemik, yağ, akciğer, iyot, hava ekleri ve 1–4 mm kemik noktaları' },
  qaMetal: { label: 'Fantom + metal', z: 0, head: false, test: 'qaMetal', hint: 'Aynı fantom + iki çelik çubuk (metal artefaktı)' },
  brain: { label: 'Beyin', z: 60, head: true, hint: 'Lateral ventriküller düzeyi' },
  skullbase: { label: 'Kafa tabanı', z: 136, head: true, hint: 'Petröz kemikler – ışın sertleşmesi' },
  thorax: { label: 'Toraks', z: 420, head: false, hint: 'Kalp, akciğerler, damar ağacı' },
  abdomen: { label: 'Üst batın', z: 600, head: false, hint: 'Karaciğer, böbrekler, mide' },
  pelvis: { label: 'Pelvis', z: 880, head: false, hint: 'Kalça eklemleri (hastada implant varsa metal)' },
};

export interface FormationSource {
  region: FormationRegion;
  kVp: number;
  /** etkin mAs */
  mAs: number;
  kernel: KernelId;
  thickness: number;
}

export const DEFAULT_SOURCE: FormationSource = { region: 'qa', kVp: 120, mAs: 150, kernel: 'soft', thickness: 5 };
