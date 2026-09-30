# EPOS upload pack — *From Lung to Brain* (ECR 2027)

Everything needed to enter the poster in **EPOS™** (ESR's Electronic Presentation Online System), plus the finished slides.

| File | What it is |
|---|---|
| [`../ECR2027_Poster_Lung_Cancer_Brain_Metastases_EPOS.pptx`](../ECR2027_Poster_Lung_Cancer_Brain_Metastases_EPOS.pptx) | The completed 12-slide poster (16:9, Cambria/Calibri). Your master for presenting, printing or editing. |
| [`../ECR2027_Poster_Lung_Cancer_Brain_Metastases_EPOS_preview.pdf`](../ECR2027_Poster_Lung_Cancer_Brain_Metastases_EPOS_preview.pdf) | PDF preview for quick checking. EPOS does **not** accept PDF uploads. |
| [`EPOS_text_by_section.md`](EPOS_text_by_section.md) | The text, split into the EPOS sections, ready to paste. |
| [`figures/`](figures) | 12 images in EPOS specification: 9 figures, 2 table images, 1 optional cover montage. |

## Why a pack and not just the PowerPoint

The ESR's EPOS poster guidelines state that posters **cannot be uploaded as Word, PDF or .ppt files**; the poster is built in the EPOS online editor (text in section boxes, images uploaded separately and inserted with the picture icon). So the PowerPoint is your visual master, and this folder gives you the parts in the shape the editor expects.

## Entering the poster (about 15 minutes)

1. In the EPOS author area open your poster. Scientific-exhibit sections: *Aims and objectives → Methods and materials → Results → Conclusion → Personal information → References*. (If you registered it as an **educational exhibit**, use *Aims and objectives → Background → Findings and procedure details → Conclusion*: put the "Background" block in *Background*, and Methods + Results together in *Findings and procedure details*.)
2. Paste each block of `EPOS_text_by_section.md` into the section named in its heading.
3. Upload all files from `figures/` in the editor's image box, then place each one where the `[Insert Fig. n]` / `[Insert Table n]` line sits.
4. Fill the bracketed fields (see "Still needed from you").

## Compliance check against the ESR EPOS guidelines

| Requirement | This poster |
|---|---|
| Total text at most **1,500 words** | **1279** words in the pasted text blocks (counting every symbol as a word; 1211 counting real words only). Counting the two tables' text as well, the whole poster is 1480. |
| Images are mandatory (not text-only) | 9 figures, 2 table images |
| JPG / PNG / GIF, about **1024×768 px**, **72 dpi**, **RGB**, at most **3 MB** each | All PNG, RGB, 72 dpi, largest 1024×768 px, largest file 425 KB |
| Images completely anonymised | OCR of all 32 source images found no names, IDs or dates, only the sequence labels (CT, T1+C, T2, FLAIR, DWI). Three leftover overlay glyphs were removed (see below). |
| Origin of every image stated | "Image origin" line (slide 12 / Personal information) |
| Tables may be uploaded as images | Tables 1 and 2 supplied as PNG |
| Section structure and references (20 recommended at most) | Mapped above; 12 references, each checked against web-search index records (authors, journal, year, pages) |

**Source and caveat.** I could not open myesr.org from my sandbox (blocked), so the limits above come from the ESR guideline text as returned by web search (the "EPOS poster guidelines" PDF of Dec 2023 / ECR 2024). Please skim the current ECR 2027 guideline once before uploading. The ESR page also listed **30 September 2026** as the ECR 2027 abstract-submission deadline (from a search snippet; verify). EPOS upload itself happens after acceptance.

## Still needed from you (I could not see these, so I did not invent them)

- **Author names, affiliations, corresponding e-mail**: slide 1, slide 12 (Contact) and EPOS *Personal information*. They are the only bracketed fields left: `[First Name Surname]`, `[Co-author]`, the two `[Department …]` lines, `[email]`, `[name, email]`.
- **Confirm the declarations** "no conflict of interest" and "no funding" (kept from your draft without the "[edit if applicable]" note).
- **Optional**: ethics protocol number/date, patient age/sex, timing of metastases, lesion sizes, scanner / field strength / contrast agent. None of this is visible on the images, so the related columns and sentences were removed rather than guessed. Send them and I will add them back.
- **Cases without images**: ADC-1, ADC-4, ADC-5 and SCLC-3 have no images in the file, so the poster describes the six illustrated cases and says so ("2 of 5 shown", "2 of 3 shown"). If you want all ten in the tables, I need their images or findings.

## Findings I read from the images — please verify

Everything below was read from your annotated panels (arrow colours used as your own annotations: yellow = enhancing lesion, cyan = vasogenic oedema, magenta = DWI restriction, white = primary, green = meningioma). **Sides assume radiological convention** (there are no R/L markers on the images). **Lesion counts reflect only what is visible in the panels.**

| Case | Primary tumour (chest CT) | Brain (MRI) | Panels / note |
|---|---|---|---|
| ADC-2 | Left perihilar mass with lower-lobe collapse / consolidation (coronal CT). *Least certain CT reading.* | Left medial frontal; thick irregular ring with necrotic core; extensive vasogenic oedema; rim restriction (magenta arrow) | A2_* |
| ADC-3 | Small spiculated right apical nodule with adjacent emphysematous change | Right temporal; ill-defined ring/heterogeneous enhancement (faint on this display); extensive oedema; no magenta arrow, so no restriction | A1_* |
| SCLC-1 | Lobulated left upper lobe mass, posterior, pleura-based | Right paramedian frontoparietal; small heterogeneous nodular enhancement; extensive oedema; focal restriction; separate extra-axial lesion marked green (meningioma, your label) | S2_* |
| SCLC-2 | Small left upper lobe nodule, posterior, pleura-based | Right frontoparietal; small ring-enhancing lesion; extensive oedema; rim restriction. *The T1+C slice is at orbital level and the FLAIR/DWI slices are higher, so there may be more than one lesion. Please check.* | S1_* |
| LCNEC-1 | Left apical–posterior soft-tissue mass abutting pleura (tube visible in the trachea) | Left frontal; large necrotic lesion with thick nodular wall; thin FLAIR rim and minimal oedema (no cyan arrow); DWI rim restriction with dark centre | L1_* |
| SCC-1 | Very large central mediastinal mass (over a third of the thoracic width) compressing the trachea; bullous emphysema in the right lung | Left cerebellar hemisphere; large cystic/necrotic lesion with enhancing wall; bright T2/FLAIR fluid component with oedema; heterogeneous DWI with rim restriction | Q1_* |

## What I changed compared with your draft

- **Filled** every image-derived placeholder (features per case, comparative matrix, primary-tumour table).
- **Table 1** "Demographic Data & Primary Lung Tumour Profiles" became "Primary Lung Tumour Profiles": Age/Sex, Size (mm), Nodes and BM timing are not visible on images, so they were replaced by "Brain metastasis (MRI)". The table lists the six illustrated cases.
- **Methods**: removed "single-centre", exclusion criteria, scanner, field strength, contrast agent, number of readers/blinding and "nodes" (not reported anywhere); added "six representative cases"; wrote "apparent diffusion coefficient maps" in full because your case IDs "ADC-n" mean adenocarcinoma.
- **Literature column** of the matrix now cites sources; the DWI statement changed from "usually absent" to "variable; frequent in SCLC/LCNEC, about 55% of NSCLC; not histology-specific" (refs 9, 11, 12). The "textbook CT pattern" footnote was dropped for space; its point is now in the Discussion.
- **References corrected**: Seute pages are 1827–1834 (not 1832) and the full title; Le Rhun, Rangachari and Sperduto titles completed; every reference is now cited in the text. **Added** Jung 2018, Mujoomdar 2007, Zhu 2023, Pomohaci 2025 (your note asked for DWI and squamous/LCNEC references; I found no LCNEC-specific imaging reference I could verify, so LCNEC ≈ SCLC is cited to the WHO 2021 paper only). Citations in the matrix and Discussion were matched to what each paper reports (Zhu: SCLC; Pomohaci: NSCLC vs SCLC; Jung: DWI vs histology; Mujoomdar: squamous vs non-squamous).
- **Take-home 1** no longer says "every lung cancer patient" (recommendations for staging brain MRI differ by stage and histology); it now cites the EANO–ESMO guideline. Please confirm you are happy with that wording.
- **Images**: removed three leftover overlay glyphs at image edges (a "28" on ADC-3 CT, a "1" on LCNEC-1 CT, an "n" on the SCC-1 mediastinal CT); no anatomy changed.
- **Technical**: real slide titles, alt text on all 44 picture placements (before: local file paths such as `/home/claude/ann/A1_CT.png`), clean document properties (no "PptxGenJS"), identical images stored once (14 MB → 7.6 MB), empty stray text box removed, caption/rule overlap on the SCLC slide fixed, larger captions and table text.
- Speaker notes now hold the EPOS section for each slide. Your alternative titles (kept here, removed from the notes): *Beyond the Primary: MRI Phenotypes of Brain Metastases Across Lung Cancer Histological Subtypes* and *Histology Leaves Its Fingerprint: A Pictorial Review of Brain Metastases in Lung Cancer*. The current title is about 24 words; check the length limit on the submission form.

## Image files

| File | Pixels | Mode | Size |
|---|---|---|---|
| `Cover_montage_optional.png` | 1023 × 680 | RGB | 361 KB |
| `Fig01_primary_tumours_CT.png` | 1023 × 680 | RGB | 425 KB |
| `Fig02_ADC-3.png` | 768 × 768 | RGB | 285 KB |
| `Fig03_ADC-2.png` | 768 × 768 | RGB | 295 KB |
| `Fig04_SCC-1.png` | 1023 × 680 | RGB | 394 KB |
| `Fig05_SCLC-2.png` | 768 × 768 | RGB | 273 KB |
| `Fig06_SCLC-1.png` | 768 × 768 | RGB | 274 KB |
| `Fig07_LCNEC-1.png` | 768 × 768 | RGB | 257 KB |
| `Fig08_T1C_montage.png` | 768 × 768 | RGB | 281 KB |
| `Fig09_pitfall_SCLC-1_T1C.png` | 640 × 640 | RGB | 137 KB |
| `Table1_primary_tumour_profiles.png` | 1024 × 281 | RGB | 52 KB |
| `Table2_comparative_matrix.png` | 1024 × 363 | RGB | 61 KB |
