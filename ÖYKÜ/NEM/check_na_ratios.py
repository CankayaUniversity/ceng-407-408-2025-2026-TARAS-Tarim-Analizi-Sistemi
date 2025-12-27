import pandas as pd
from pathlib import Path

desktop = Path.home() / "Desktop"

original_file = desktop / "crop_type_deleted.xlsx"
updated_file = desktop / "values_updated.xlsx"

df_original = pd.read_excel(original_file)
df_updated = pd.read_excel(updated_file)

# iki dosya için de NA'ları hesaplamak için
def calculate_na_ratios(df, file_name):
    print(f"\n{file_name}: NA ratios:")
    print("-" * 50)
    
    total_rows = len(df)
    
    # her sütun için
    for column in df.columns:
        na_count = df[column].isna().sum()
        na_ratio = (na_count / total_rows) * 100
        print(f"{column:30} : {na_ratio:.2f}% ({na_count} NA / {total_rows} toplam)")

calculate_na_ratios(df_original, "crop_type_deleted.xlsx")
calculate_na_ratios(df_updated, "values_updated.xlsx")

print("\nChanges in NA:\n")


for column in df_original.columns:
    original_na = df_original[column].isna().sum() / len(df_original) * 100
    updated_na = df_updated[column].isna().sum() / len(df_updated) * 100
    
    difference = updated_na - original_na
    
    if abs(difference) > 0:  
        print(f"{column:30} : {difference:+.2f}% değişim")