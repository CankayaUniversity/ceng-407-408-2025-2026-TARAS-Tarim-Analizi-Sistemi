import pandas as pd
from pathlib import Path

desktop = Path.home() / "Desktop"

input_file = desktop / "crop_type_deleted.xlsx"
df = pd.read_excel(input_file, dtype=str)

# sayısal sütunları düzeltmek için
for col in df.columns:
    # sütundaki sayısal değerlerin oranını kontrol etmek için
    numeric_count = 0
    total_count = 0
    
    for value in df[col]:
        if pd.isna(value):
            continue
        total_count += 1
        # sayı olabilecek değerler(nokta içeren)
        if str(value).replace('.', '').replace(',', '').replace('-', '').isdigit():
            numeric_count += 1
    
    # sütunun çoğunluğu sayısal değilse, bu sütunu atla
    if total_count > 0 and (numeric_count / total_count) < 0.7:
        continue
        
    try:
        def fix_number(x):
            if pd.isna(x):  
                return x
            
            x = str(x)
            # stringse vs ise, olduğu gibi bırak
            if not any(c.isdigit() for c in x):
                return x
                
            dot_count = x.count('.')
            
            if dot_count <= 1:  
                return x
            else:  # Birden fazla nokta varsa 
                # ilk noktayı virgüle çevir, diğerlerini sil
                parts = x.split('.')
                result = parts[0] + ',' + ''.join(parts[1:])
                return result
        
        original_values = df[col].copy()
        
        df[col] = df[col].apply(fix_number)
        
        numeric_values = pd.to_numeric(df[col].str.replace(',', '.'), errors='coerce')
        
        if numeric_values.notna().any(): 
            # sayısalları  düzelt, metin değerleri geri yükle
            for idx in df.index:
                if pd.notna(numeric_values[idx]):
                    df.at[idx, col] = str(round(numeric_values[idx], 3)).replace('.', ',')
                else:
                    df.at[idx, col] = original_values[idx]
    except Exception as e:
        continue
    except:
        continue

output_file = desktop / "values_updated.xlsx"
df.to_excel(output_file, index=False, engine="openpyxl")

print(f"Completede succesfully")
print(f"Saved: {output_file}")