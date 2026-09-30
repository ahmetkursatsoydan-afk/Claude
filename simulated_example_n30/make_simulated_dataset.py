"""Builds the SIMULATED n=30 dataset (10 per histological group).

Group-level counts were chosen to follow the direction of effects reported in the literature
(SCLC: more, smaller, DWI-bright, non-necrotic lesions; squamous: fewer, cystic/necrotic lesions
and central primaries; adenocarcinoma: peripheral primaries, marked oedema; DWI not histology-specific).
NOT real patient data. Replace simulated_dataset_n30.csv with your own file (same columns) and re-run analyze_n30.py.
"""
import csv, random

rng = random.Random(2027)
GROUPS = {
    # group: dict(lesions, ages, males, binary-variable counts out of 10)
    "ADC": dict(lesions=[1, 2, 2, 3, 3, 3, 4, 5, 6, 8],
                ages=[52, 55, 58, 60, 61, 62, 63, 65, 66, 68], males=6,
                central=2, ring=6, oedema=8, dwi=5, infra=4),
    "SCC": dict(lesions=[1, 1, 1, 2, 2, 2, 3, 3, 4, 5],
                ages=[58, 61, 63, 64, 66, 67, 68, 70, 71, 73], males=9,
                central=8, ring=8, oedema=4, dwi=4, infra=3),
    "SCLC_NE": dict(lesions=[3, 4, 5, 5, 6, 7, 8, 9, 11, 12],
                    ages=[54, 58, 60, 62, 63, 65, 66, 68, 69, 72], males=7,
                    central=8, ring=2, oedema=5, dwi=8, infra=3),
}


def flags(k, n=10):
    v = [1] * k + [0] * (n - k)
    rng.shuffle(v)
    return v


rows = []
pid = 0
for g, d in GROUPS.items():
    lesions, ages = d["lesions"][:], d["ages"][:]
    rng.shuffle(lesions); rng.shuffle(ages)
    sex = flags(d["males"]); cen = flags(d["central"]); ring = flags(d["ring"])
    oed = flags(d["oedema"]); dwi = flags(d["dwi"]); inf = flags(d["infra"])
    sub = ["SCLC"] * 7 + ["LCNEC"] * 3 if g == "SCLC_NE" else [""] * 10
    for i in range(10):
        pid += 1
        rows.append(dict(patient_id=f"P{pid:02d}", group=g, subtype=sub[i], age=ages[i], male=sex[i],
                         lesion_number=lesions[i], primary_central=cen[i], ring_necrotic_enhancement=ring[i],
                         marked_oedema=oed[i], dwi_restriction=dwi[i], infratentorial=inf[i]))
with open("simulated_dataset_n30.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader(); w.writerows(rows)
print("wrote simulated_dataset_n30.csv with", len(rows), "rows")
