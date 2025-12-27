import pandas as pd
from pathlib import Path

sheet_url = "https://docs.google.com/spreadsheets/d/1Nn4e1JoMIfBeBgobYglhj-yE7-l3q-Qe4gnmgUcQ2AU/edit?usp=drive_link"
csv_export_url = sheet_url.replace("/edit?usp=drive_link", "/gviz/tq?tqx=out:csv")

df = pd.read_csv(csv_export_url)

def find_crop_type_col(columns):
    normalized = {c: c.strip().lower().replace(" ", "").replace("-", "_") for c in columns}
    for original, norm in normalized.items():
        if norm in ("croptype", "crop_type", "crop type", "crop"):
            return original
    if "Crop Type" in columns:
        return "Crop Type"
    raise KeyError("Crop Type sütunu bulunamadı. Lütfen sütun adını kontrol edin.")

crop_col = find_crop_type_col(df.columns)

delete_values = {"teff", "sorghum", "dagussa", "niger seed"}

def norm_val(x):
    if pd.isna(x):
        return ""
    return str(x).strip().lower()

mask_delete = df[crop_col].map(norm_val).isin(delete_values)

before = len(df)
df_clean = df[~mask_delete].copy()
removed = before - len(df_clean)


desktop = Path.home() / "Desktop"
out_csv = desktop / "crop_type_deleted.csv"
out_xlsx = desktop / "crop_type_deleted.xlsx"

df_clean.to_csv(out_csv, index=False, encoding="utf-8-sig")

df_clean.to_excel(out_xlsx, index=False, engine="openpyxl")

print(f"Toplam satır: {before}")
print(f"Silinen satır: {removed}")
print(f"Kaydedildi (CSV):  {out_csv}")
print(f"Kaydedildi (XLSX): {out_xlsx}")
