// Tarla secici dropdown - mevcut tarlalar arasinda secim yapar
// Props: theme, fields (tarla listesi), selectedFieldId, onSelectField
// Modal overlay tabanli OptionDropdown kullanir — inline expansion degil,
// bu sayede liste uzun olsa bile ekran disina tasmaz.

import { View } from "react-native";
import { OptionDropdown } from "../../components/OptionDropdown";
import { FieldSelectorProps } from "./types";
import { spacing } from "../../utils/responsive";
import { useLanguage } from "../../context/LanguageContext";

export const FieldSelector = ({
  theme,
  fields,
  selectedFieldId,
  onSelectField,
}: FieldSelectorProps) => {
  const { t } = useLanguage();

  if (fields.length === 0) return null;

  const options = fields.map((f) => ({ value: f.id, label: f.name }));

  return (
    <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
      <OptionDropdown
        theme={theme}
        label={t.home.selectField}
        value={selectedFieldId ?? ""}
        options={options}
        onChange={onSelectField}
        displayLabel={selectedFieldId == null ? t.home.selectField : undefined}
        showLabel={false}
      />
    </View>
  );
};
