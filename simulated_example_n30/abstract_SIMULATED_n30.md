# ECR 2027 abstract — ILLUSTRATIVE EXAMPLE (n = 30, SIMULATED DATA)

> **Not real patient data.** Every number below comes from `simulated_dataset_n30.csv`, a hypothetical 30-patient dataset built to follow the *direction* of effects reported in the literature. It shows what a finished abstract would look like. **Do not submit it.** Replace the CSV with your own data and re-run `analyze_n30.py` to get real statistics (same columns, same tests), then compare.

**Length:** 256 words including the four headings (248 without), limit 280.

---

**Purpose**

To test whether chest CT features of the primary tumour and brain MRI features of metastases differ by histological subtype in lung cancer, and to derive teaching points for radiologists.

**Methods and materials**

In this retrospective pictorial case series, 30 patients with histologically proven lung cancer and brain metastases were included: 10 adenocarcinoma, 10 squamous cell carcinoma and 10 small cell/neuroendocrine carcinoma (7 SCLC, 3 LCNEC). Two radiologists reviewed, by consensus, chest CT (primary location, cavitation) and brain MRI (T1 post-contrast, T2, FLAIR, DWI: lesion number, enhancement, oedema, diffusion restriction, site). Groups were compared with Kruskal–Wallis and exact Freeman–Halton tests (p<0.05).

**Results**

Mean age was 63.6 years; 22 patients were men. Brain lesion number differed (median 3 vs 2 vs 6.5; p=0.001); three or more lesions occurred in 70%, 40% and 100% (p=0.016). Central primaries were less frequent in adenocarcinoma (20%) than in squamous (80%) and small cell/neuroendocrine tumours (80%; p=0.012). Ring/necrotic enhancement was commoner in squamous (80%) and adenocarcinoma (60%) than in small cell/neuroendocrine metastases (20%; p=0.037), which were mostly solid. Marked oedema (80% vs 40% vs 50%; p=0.27), DWI restriction (50% vs 40% vs 80%; p=0.27) and infratentorial involvement (40% vs 30% vs 30%; p=1.0) did not differ. Representative cases illustrate each pattern and pitfalls such as incidental meningioma.

**Conclusion and limitations**

A peripheral primary favoured adenocarcinoma, ring/necrotic enhancement favoured non-small cell histology, and multiple solid lesions favoured small cell/neuroendocrine tumours; overlap was substantial and DWI did not discriminate histology. Limitations: small retrospective cohort, heterogeneous MRI protocols, uncorrected multiple comparisons; validation is needed.

---

## Numbers behind the abstract (from `analyze_n30.py`)

| Feature | Adenocarcinoma (10) | Squamous (10) | SCLC / neuroendocrine (10) | p |
|---|---|---|---|---|
| Lesion number, median (IQR) | 3 (2.25–4.75) | 2 (1.25–3) | 6.5 (5–8.75) | 0.001 (Kruskal–Wallis) |
| ≥ 3 lesions | 7 (70%) | 4 (40%) | 10 (100%) | 0.016 |
| Central primary | 2 (20%) | 8 (80%) | 8 (80%) | 0.012 |
| Ring/necrotic enhancement | 6 (60%) | 8 (80%) | 2 (20%) | 0.037 |
| Marked oedema | 8 (80%) | 4 (40%) | 5 (50%) | 0.27 |
| DWI restriction | 5 (50%) | 4 (40%) | 8 (80%) | 0.27 |
| Infratentorial involvement | 4 (40%) | 3 (30%) | 3 (30%) | 1.0 |
| Age, median (IQR) | 61.5 (58.5–64.5) | 66.5 (63.3–69.5) | 64 (60.5–67.5) | 0.11 |
| Men | 6 (60%) | 9 (90%) | 7 (70%) | 0.45 |

Exact (Freeman–Halton) tests for binary features; p values are not corrected for multiple comparisons. All 30 patients: mean age 63.6 (SD 5.3), 22 men. The "SCLC/neuroendocrine" group is 7 SCLC + 3 LCNEC (column `subtype`).

## Why these directions (literature basis)

- **More lesions in SCLC, DWI-bright, often homogeneous enhancement:** Zhu 2023 (Cancer Med 12:15199), Pomohaci 2025 (J Med Life 18:563; SCLC had significantly more lesions).
- **NSCLC metastases often necrotic/ring-enhancing with peripheral oedema; DWI restriction in about half:** Pomohaci 2025.
- **DWI does not discriminate histology (hence p = 0.27 here):** Jung 2018 (AJNR 39:273).
- **Squamous cell carcinoma metastasises to the brain less often than non-squamous NSCLC, typically with central primaries:** Mujoomdar 2007 (Radiology 242:882).
- Effect sizes are illustrative, not meta-analytic; with 10 patients per group only large differences reach p < 0.05.

## How to compare with your real data

1. Put your data in a CSV with the same columns as `simulated_dataset_n30.csv` (`group` = ADC / SCC / SCLC_NE; 0/1 for the yes/no features).
2. Run `python3 analyze_n30.py your_data.csv`.
3. Send me the output (or the file) and I will rewrite the abstract with the real numbers and update the poster.
