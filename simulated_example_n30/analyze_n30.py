"""Descriptive statistics and tests for the n=30 three-group design.

Usage: python3 analyze_n30.py [dataset.csv]      (default: simulated_dataset_n30.csv)
Works unchanged on your real data if the CSV has the same columns.
Tests: Kruskal-Wallis (lesion number, age); exact Freeman-Halton test for each binary feature (3 x 2 tables).
"""
import sys, itertools, math
import numpy as np, pandas as pd
from scipy import stats

path = sys.argv[1] if len(sys.argv) > 1 else "simulated_dataset_n30.csv"
df = pd.read_csv(path)
order = ["ADC", "SCC", "SCLC_NE"]
n = df.groupby("group").size().reindex(order)
print(f"File: {path}   N = {len(df)}   per group: {dict(n)}")


def fh_exact(table):
    """Exact p for an r x 2 table (Freeman-Halton): sum of probabilities of tables (same margins) not more likely than observed."""
    table = np.asarray(table)
    rows = table.sum(axis=1); k = table[:, 0].sum(); N = rows.sum()
    def prob(col0):
        num = 1
        for r, a in zip(rows, col0):
            num *= math.comb(int(r), int(a))
        return num / math.comb(int(N), int(k))
    obs = prob(table[:, 0]); p = 0.0
    for col0 in itertools.product(*[range(int(r) + 1) for r in rows]):
        if sum(col0) == k:
            pr = prob(col0)
            if pr <= obs * (1 + 1e-9):
                p += pr
    return p


def med_iqr(x):
    q1, m, q3 = np.percentile(x, [25, 50, 75])
    return f"{m:g} ({q1:g}-{q3:g})"


print("\nContinuous variables - median (IQR) and Kruskal-Wallis")
for col in ["age", "lesion_number"]:
    groups = [df.loc[df.group == g, col] for g in order]
    h, p = stats.kruskal(*groups)
    print(f"  {col:<15}" + "  ".join(f"{g}: {med_iqr(x)}" for g, x in zip(order, groups)) + f"   H={h:.2f}  p={p:.4f}")

print("\nBinary variables - n/N (%) and exact Freeman-Halton p")
bins = ["male", "primary_central", "ring_necrotic_enhancement", "marked_oedema", "dwi_restriction", "infratentorial"]
df["multiple_ge3"] = (df.lesion_number >= 3).astype(int)
for col in bins + ["multiple_ge3"]:
    tab = np.array([[df.loc[df.group == g, col].sum(), (df.group == g).sum() - df.loc[df.group == g, col].sum()] for g in order])
    cells = "  ".join(f"{g}: {a}/{a + b} ({100 * a / (a + b):.0f}%)" for g, (a, b) in zip(order, tab))
    print(f"  {col:<26}{cells}   p={fh_exact(tab):.4f}")
tot = df[["ring_necrotic_enhancement"]].sum().iloc[0]
print(f"\nAll patients: mean age {df.age.mean():.1f} (SD {df.age.std():.1f}); men {df.male.sum()}/{len(df)}")
