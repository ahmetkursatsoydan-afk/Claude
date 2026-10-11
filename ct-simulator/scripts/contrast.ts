import { mkdirSync as __mk } from 'node:fs';
__mk(process.env.OUT ?? 'out/', { recursive: true });
import { compartmentConc } from '../src/physics/contrast';
for (const t of [20,24,35,45,70,100,180,300]) {
  console.log(t, ['aorta','portal','liver','spleen','pancreas','kidneyCortex','kidneyMedulla','svc','pulmArtery','ivcInfra','collecting'].map(c=>c+':'+(compartmentConc(c,t)*25).toFixed(0)).join(' '));
}
