// Tab navigation icin module-level ref — ChatContext buradan programatik nav yapiyor

import { createNavigationContainerRef } from "@react-navigation/native";

export type TabParamList = {
  carbon: undefined;
  timetable: undefined;
  home: undefined;
  disease: undefined;
  settings: undefined;
};

export const navigationRef = createNavigationContainerRef<TabParamList>();
