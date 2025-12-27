import pandas as pd
import numpy as np
from pathlib import Path

try:
    desktop = Path.home() / "Desktop"
    input_file = desktop / "values_updated.xlsx"

    if not input_file.exists():
        raise FileNotFoundError(f"No file found: {input_file}")

    # Excel dosyasını oku, string sütunları belirle
    df = pd.read_excel(input_file)
    string_columns = ['Soil Color', 'Crop Type']  # Bildiğimiz string sütunlar
    
    # Veri dönüşümü fonksiyonu
    def convert_to_numeric(x):
        if pd.isna(x):  # NA değerleri koru
            return x
        try:
            if isinstance(x, str):
                # Virgüllü sayıları noktalı formata çevir
                x = x.replace(',', '.')
            return pd.to_numeric(x)
        except:
            return x
    
    # String olmayan sütunları sayısala çevir
    for col in df.columns:
        if col not in string_columns:
            df[col] = df[col].apply(convert_to_numeric)
    
    print("\nColumn Types:")
    for col in df.columns:
        print(f"{col:<30}: {df[col].dtype}")

except Exception as e:
    print(f"Error: {str(e)}")
    raise

# Sayısal kolonları belirle (object tipindeki string kolonları hariç tut)
numeric_columns = df.select_dtypes(include=["float64", "int64"]).columns
string_columns = df.select_dtypes(include=["object"]).columns

print("\nNumeric columns:", len(numeric_columns))
print("String columns:", len(string_columns))
print("\nString columns list:")
for col in string_columns:
    print(f"- {col}")

outliers_summary = {}
total_outliers = 0

print("\n" + "-" * 60)
print(f"{'Column':<30} {'Lower Bound':>10} {'Upper Bound':>10} {'Outlier #':>12}")
print("-" * 60)

for column in numeric_columns:
    data = df[column].dropna()

    if len(data) == 0:
        continue

    Q1 = data.quantile(0.25)
    Q3 = data.quantile(0.75)
    IQR = Q3 - Q1

    lower_bound = Q1 - 1.5 * IQR
    upper_bound = Q3 + 1.5 * IQR

    outlier_mask = (df[column] < lower_bound) | (df[column] > upper_bound)
    outlier_count = outlier_mask.sum()

    print(f"{column:<30} {lower_bound:>10.3f} {upper_bound:>10.3f} {outlier_count:>12}")

    df.loc[outlier_mask, column] = np.nan
    outliers_summary[column] = outlier_count
    total_outliers += outlier_count

print("-" * 60)
print(f"Total Outlier #: {total_outliers:,}")
print("-" * 60)

output_file = desktop / "values_without_outliers.xlsx"
df.to_excel(output_file, index=False)
print(f"File saved: {output_file}")
