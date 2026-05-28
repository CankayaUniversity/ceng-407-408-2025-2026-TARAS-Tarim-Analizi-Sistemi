// Ceviri sozlugu - Turkce ve Ingilizce tum UI metinleri
// getStrings(language) ile ilgili dil sozlugu alinir

export type Language = "tr" | "en";

export interface StringDictionary {
  // Common
  common: {
    loading: string;
    error: string;
    success: string;
    cancel: string;
    yes: string;
    no: string;
    ok: string;
    send: string;
    delete: string;
    retry: string;
    back: string;
    share: string;
    close: string;
    save: string;
  };

  // Login Screen
  login: {
    emailPlaceholder: string;
    usernamePlaceholder: string;
    passwordPlaceholder: string;
    confirmPasswordPlaceholder: string;
    farmNamePlaceholder: string;
    loginButton: string;
    registerButton: string;
    skipButton: string;
    localDemoButton: string;
    localDemoSubtitle: string;
    awsDemoButton: string;
    awsDemoSubtitle: string;
    demoOnlyHeading: string;
    demoOnlyBody: string;
    switchToRegister: string;
    switchToLogin: string;
    connectingToServer: string;
    serverOffline: string;
    loggingIn: string;
    errorEmptyCredentials: string;
    errorConnectionFailed: string;
    errorLoginFailed: string;
    errorEmptyFields: string;
    errorPasswordMismatch: string;
    errorRegistrationFailed: string;
    welcomeMessage: string;
  };

  // Home Screen
  home: {
    airTemperature: string;
    airHumidity: string;
    timeToIrrigation: string;
    soilMoisture: string;
    selectField: string;
    loading3DModel: string;
    dataSourceAWS: string;
    dataSourceDemo: string;
    lastReading: string;
    noFieldsTitle: string;
    noFieldsSubtitle: string;
    addField: string;
    fieldOverview: string;
    tapZoneHint: string;
    irrigation: string;
    now: string;
    unitMin: string;
    unitHr: string;
    unitDay: string;
    lastUpdated: string;
  };

  // Disease Screen
  disease: {
    noAnalysisYet: string;
    noAnalysisSubtitle: string;
    takePhotoButton: string;
    loadingResults: string;
    errorLoadingResults: string;
    sentForAnalysis: string;
    errorSendingImage: string;
    errorGeneric: string;
    deleteTitle: string;
    deleteConfirmation: string;
    deletedSuccessfully: string;
    errorDeleting: string;
    statusPending: string;
    statusProcessing: string;
    statusCompleted: string;
    statusFailed: string;
    justNow: string;
    minutesAgo: string;
    hoursAgo: string;
    yesterday: string;
    daysAgo: string;
    analyzingLeaf: string;
    confidence: string;
    analysisFailed: string;
    waitingInQueue: string;
    failedToSend: string;
    failedToSendSubtitle: string;
    retryButton: string;
    retrying: string;
    retrySuccess: string;
    queuedForRetry: string;
    allPredictions: string;
    detailTitle: string;
    detailNoData: string;
    detailConfidenceRaw: string;
    detailConfidenceScore: string;
    detailRecommendations: string;
    detailTimestamps: string;
    detailDetectionId: string;
    detailCapturedAt: string;
    uncertainTitle: string;
    uncertainMessage: string;
    uncertainPossibleGuess: string;
    feedbackPrompt: string;
    feedbackThanks: string;
    feedbackError: string;
    feedbackDefinitelyWrong: string;
    feedbackLikelyWrong: string;
    feedbackUnsure: string;
    feedbackLikelyCorrect: string;
    feedbackDefinitelyCorrect: string;
    correctionPrompt: string;
    correctionPickerTitle: string;
    correctionCancel: string;
    correctionConfirm: string;
    correctionDontKnow: string;
    correctionOther: string;
    correctionBacterialSpot: string;
    correctionCornCommonRust: string;
    correctionCornGrayLeafSpot: string;
    correctionCornNorthernLeafBlight: string;
    correctionEarlyBlight: string;
    correctionHealthy: string;
    correctionLateBlight: string;
    correctionLeafMold: string;
    correctionMosaicVirus: string;
    correctionPowderyMildew: string;
    correctionSeptoriaLeafSpot: string;
    correctionSpiderMites: string;
    correctionTargetSpot: string;
    correctionYellowLeafCurlVirus: string;
    // ── Klasor (folder) ekranlari ──
    foldersSectionTitle: string;
    foldersEmpty: string;
    generalSectionTitle: string;
    showMore: string;
    folderCreateButton: string;
    folderCreateTitle: string;
    folderCreateHelper: string;
    folderCreateZoneLabel: string;
    folderCreateZoneLoadError: string;
    folderCreateNoZones: string;
    folderCreateNameLabel: string;
    folderCreateNamePlaceholder: string;
    folderCreateNamePlaceholderEmpty: string;
    folderCreateConfirm: string;
    folderCreatePickZone: string;
    folderCreateNameRequired: string;
    folderCreateSuccess: string;
    folderCreateDuplicateName: string;
    folderCreateNoActivePlanting: string;
    folderCreateGenericError: string;
    folderPhotoSingular: string;
    folderPhotoPlural: string;
    folderDetailLoadError: string;
    folderDetailTarget: string;
    folderDetailStarted: string;
    folderDetailTimeline: string;
    folderDetailEmpty: string;
    folderDeactivateTitle: string;
    folderDeactivateConfirmation: string;
    folderDeactivateConfirm: string;
    folderDeactivateSuccess: string;
    folderDeactivateError: string;
    folderAddPhotoTo: string;
    folderCameraAddingTo: string;
    // ── Demo modu ──
    sampleButton: string;
    sampleSheetTitle: string;
    sampleResolveError: string;
    demoHardwareUnavailable: string;
  };

  // Camera Screen
  camera: {
    permissionTitle: string;
    permissionButton: string;
    permissionDeniedTitle: string;
    permissionDeniedMessage: string;
    retryButton: string;
    galleryError: string;
    cameraNotReady: string;
    photoError: string;
    sendTitle: string;
    sendConfirmation: string;
    sentSuccess: string;
    liveCameraUnavailable: string;
    liveCameraMessage: string;
    systemPermissionDescription: string;
    cancelButton: string;
    sendButton: string;
    liveMode: string;
    photoMode: string;
    liveScanLoading: string;
    liveScanUncertain: string;
    liveScanAdjustLight: string;
    localResultBanner: string;
    retakeButton: string;
    closeButton: string;
  };

  // Timetable Screen
  timetable: {
    title: string;
    noFieldSelected: string;
    loadingSensorData: string;
    loadFailed: string;
    noDataYet: string;
    connectionError: string;
    unknownError: string;
    pullToRefresh: string;
    last72Hours: string;
    table: string;
    charts: string;
    temperature: string;
    temperatureShort: string;
    humidity: string;
    humidityShort: string;
    soilMoisture: string;
    soilMoistureShort: string;
    shareCSV: string;
    sensorData: string;
    total: string;
    showing: string;
    time: string;
    node: string;
    interpolated: string;
    pointsOf: string;
    points: string;
    tapToView: string;
    tapDotsForValues: string;
    lastUpdated: string;
    range6h: string;
    range24h: string;
    range3d: string;
    range1w: string;
    range1m: string;
    sensorDump: string;
    hours: string;
    dateTime: string;
    rawMoisture: string;
    // Yeni: filtre menusu + multi-series + tablo
    filters: string;
    timeRange: string;
    metrics: string;
    zones: string;
    selectAll: string;
    applyFilters: string;
    resetFilters: string;
    aggregationMode: string;
    modePerNode: string;
    modePerZone: string;
    modeFieldAvg: string;
    allHidden: string;
    // Stats header (table view)
    summary: string;
    avg: string;
    min: string;
    max: string;
    readings: string;
    // Range dropdown
    custom: string;
    // Zone select-all toggle
    selectNone: string;
  };

  // Bottom navigation bar
  nav: {
    carbon: string;
    timetable: string;
    home: string;
    disease: string;
    settings: string;
  };

  // Settings Screen
  settings: {
    title: string;
    account: string;
    role: string;
    roleFarmer: string;
    roleAdmin: string;
    roleUser: string;
    farmManagement: string;
    activeFarm: string;
    noFarmSelected: string;
    noFarmCreated: string;
    fieldsConnected: string;
    createNewFarm: string;
    deleteFarm: string;
    deleteFarmConfirmTitle: string;
    deleteFarmConfirmMessage: string;
    deleteField: string;
    deleteFieldConfirmTitle: string;
    deleteFieldConfirmMessage: string;
    deleteConfirm: string;
    fieldManagement: string;
    noFields: string;
    hardwareSubtitle: string;
    appPreferences: string;
    privacySection: string;
    themeMode: string;
    themeLight: string;
    themeDark: string;
    themeSystem: string;
    language: string;
    languageTurkish: string;
    languageEnglish: string;
    datasetConsentTitle: string;
    datasetConsentSubtitle: string;
    editProfile: string;
    editProfileTitle: string;
    usernameLabel: string;
    emailLabel: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    saveChanges: string;
    profileUpdated: string;
    profileUpdateFailed: string;
    datasetConsentDisableTitle: string;
    datasetConsentDisableMessage: string;
    datasetConsentDisableConfirm: string;
    logout: string;
  };

  // Hardware Setup
  hardware: {
    title: string;
    addGateway: string;
    addGatewayDesc: string;
    addSensorNode: string;
    addSensorNodeDesc: string;
    selectFarm: string;
    scanningGateways: string;
    noGatewaysFound: string;
    enterWifi: string;
    ssidPlaceholder: string;
    passwordPlaceholder: string;
    configureGateway: string;
    provisioning: string;
    gatewayConfigured: string;
    selectGateway: string;
    gatewayOffline: string;
    selectZone: string;
    startPairing: string;
    searchingNodes: string;
    nodeFound: string;
    approve: string;
    decline: string;
    autoRejectNotice: string;
    noZonesFound: string;
    nodePaired: string;
    pairingTimeout: string;
    bleDisabled: string;
    blePermissionNeeded: string;
    connectionLost: string;
    retry: string;
    powerOnSensor: string;
    done: string;
    registering: string;
    writingConfig: string;
    waitingGateway: string;
    testingWifi: string;
    wifiFailed: string;
    backendUnreachable: string;
    provisionFailed: string;
    online: string;
    offline: string;
    sensors: string;
    firmwareVersion: string;
    firmwareUpToDate: string;
    updateAvailable: string;
    updateConfirmTitle: string;
    updateConfirmMessage: string;
    updating: string;
    updateSuccess: string;
    updateFailed: string;
  };

  // Chat
  chat: {
    title: string;
    placeholder: string;
    newChat: string;
    tapToOpen: string;
    history: string;
    historyEmpty: string;
    readMore: string;
  };

  // Error Boundary / 3D
  errors: {
    visualization3DError: string;
    retryButton: string;
    showDetails: string;
    hideDetails: string;
    errorDetails: string;
    preparing: string;
    checking3DModule: string;
    cannotLoad3D: string;
    hideDebug: string;
    showDebug: string;
    loading3D: string;
  };

  // Node Popup
  nodePopup: {
    soilMoisture: string;
    airTemperature: string;
    airHumidity: string;
    sensor: string;
  };

  // Carbon Footprint
  carbon: {
    title: string;
    comingSoon: string;
    loadError: string;
    typeRequired: string;
    amountRequired: string;
    logSuccess: string;
    logError: string;
    kgCO2: string;
    deleteConfirmTitle: string;
    deleteConfirmMessage: string;
    deleteSuccess: string;
    deleteError: string;
    loadingFarms: string;
    noFarmFound: string;
    summaryTitle: string;
    addLog: string;
    selectActivityType: string;
    noData: string;
    amount: string;
    date: string;
    notes: string;
    notesPlaceholder: string;
    logActivity: string;
    recentLogs: string;
    noLogs: string;
    noLogsSubtitle: string;
    categoryFuel: string;
    categoryFertilizer: string;
    categoryElectricity: string;
  };

  // Notifications Screen
  notifications: {
    title: string;
    empty: string;
  };

  // Irrigation Detail
  irrigation: {
    welcome: string;
    nextIrrigation: string;
    soilMoisture: string;
    zone: string;
    detail: string;
    recommendedAmount: string;
    recommendedTime: string;
    currentMoisture: string;
    didIrrigateAmount: string;
    didIrrigateTime: string;
    actualAmount: string;
    actualTime: string;
    enterAmount: string;
    selectDateTime: string;
    save: string;
    saved: string;
    saveFailed: string;
    history: string;
    noHistory: string;
    noRecommendation: string;
    ml: string;
    tapForDetails: string;
    targetMoisture: string;
    crop: string;
    growthStage: string;
    status: string;
    urgencyLevel: string;
    reasoning: string;
    recommendationTime: string;
    noActiveRecommendation: string;
    noActiveRecommendationSub: string;
    noIrrigationNeeded: string;
    noIrrigationNeededSub: string;
    lastChecked: string;
    confirmIrrigationQuestion: string;
    yesFollowedExactly: string;
    noUsedDifferent: string;
    enterActualValues: string;
    amountQuestion: string;
    timeQuestion: string;
    amountInvalid: string;
    // Card-level display strings
    pendingRecommendation: string;
    noSuggestion: string;
    urgencyHigh: string;
    urgencyMedium: string;
    urgencyLow: string;
    urgencyCritical: string;
    lastIrrigation: string;
    irrigationRecommended: string;
    whyRecommended: string;
    defaultReasoning: string;
    // Manual irrigation
    manualIrrigation: string;
    manualIrrigationDesc: string;
    manualAmount: string;
    manualDuration: string;
    manualTime: string;
    manualSaved: string;
    manualSaveFailed: string;
    recommendButton: string;
    recommendationRunning: string;
    recommendationGenerated: string;
    recommendationFailed: string;
    noZonesFound: string;
    noPlantingError: string;
    zonesSuccess: string;
    zonesFailed: string;
    enterDuration: string;
    cancel: string;
  };

  // Add Field
  addField: {
    addNewField: string;
    selectFieldType: string;
    greenhouse: string;
    greenhouseDesc: string;
    potArea: string;
    potAreaDesc: string;
    fieldName: string;
    fieldNamePlaceholder: string;
    cropName: string;
    cropNamePlaceholder: string;
    next: string;
    drawBoundary: string;
    drawBoundaryHint: string;
    drawZones: string;
    drawZonesHint: string;
    addZone: string;
    zoneName: string;
    zoneNamePlaceholder: string;
    closePolygon: string;
    undoPoint: string;
    clearAll: string;
    deleteZone: string;
    potCount: string;
    potCountPlaceholder: string;
    potCountHint: string;
    preview: string;
    fieldNameLabel: string;
    fieldTypeLabel: string;
    zoneCountLabel: string;
    potCountLabel: string;
    cropLabel: string;
    createField: string;
    creating: string;
    fieldCreated: string;
    fieldCreateError: string;
    nameRequired: string;
    minPoints: string;
    minOneZone: string;
    potCountPositive: string;
    potCountMax: string;
    zoneNameRequired: string;
    splitZonesHint: string;
    splitFailed: string;
    cancelSplit: string;
    selectSecondPoint: string;
    plantingTitle: string;
    plantingHint: string;
    plantingDateLabel: string;
    plantingDateRequired: string;
    selectCrop: string;
    selectDate: string;
    noCrops: string;
    growthDays: string;
  };

  // Register Screen
  register: {
    stepUserInfo: string;
    usernamePlaceholder: string;
    emailPlaceholder: string;
    passwordPlaceholder: string;
    confirmPasswordPlaceholder: string;
    roleLabel: string;
    roleFarmer: string;
    roleAdmin: string;
    createAccountButton: string;
    backToLogin: string;
    connectingToServer: string;
    registering: string;
    errorEmptyFields: string;
    errorInvalidEmail: string;
    errorPasswordTooShort: string;
    errorPasswordMismatch: string;
    errorRegistrationFailed: string;
    errorConnectionFailed: string;
  };

  // Empty Farm State / Create Farm
  farm: {
    addFarm: string;
    farmNamePlaceholder: string;
    createFarm: string;
    creating: string;
    farmCreated: string;
    farmCreateError: string;
    farmNameRequired: string;
    selectLocation: string;
    selectLocationHint: string;
    latitude: string;
    longitude: string;
    altitude: string;
    altitudeHint: string;
    altitudeFetchFailed: string;
    fetchingAltitude: string;
    locationRequired: string;
    altitudeRequired: string;
    searchPlaceholder: string;
    searchNoResults: string;
  };
}

const tr: StringDictionary = {
  common: {
    loading: "Yükleniyor...",
    error: "Hata",
    success: "Başarılı",
    cancel: "İptal",
    yes: "Evet",
    no: "Hayır",
    ok: "Tamam",
    send: "Gönder",
    delete: "Sil",
    retry: "Tekrar Dene",
    back: "Geri",
    share: "Paylaş",
    close: "Kapat",
    save: "Kaydet",
  },

  login: {
    emailPlaceholder: "E-posta",
    usernamePlaceholder: "Kullanıcı Adı",
    passwordPlaceholder: "Şifre",
    confirmPasswordPlaceholder: "Şifre Tekrar",
    farmNamePlaceholder: "Çiftlik Adı",
    loginButton: "Giriş Yap",
    registerButton: "Kayıt Ol",
    skipButton: "Demo modu ile devam et",
    localDemoButton: "Local Demo",
    localDemoSubtitle: "Tamamen yerel — hesap gerekmez",
    awsDemoButton: "Canlı Sunucu Demo",
    awsDemoSubtitle: "Bulutta canlı sensör verileriyle örnek hesap",
    demoOnlyHeading: "Demoyu Keşfet",
    demoOnlyBody: "TARAS'ı nasıl deneyimleyeceğini seç",
    switchToRegister: "Hesabınız yok mu? Kayıt Ol",
    switchToLogin: "Zaten hesabınız var mı? Giriş Yap",
    connectingToServer: "Sunucuya bağlanılıyor...",
    serverOffline: "Sunucu çevrimdışı",
    loggingIn: "Giriş yapılıyor...",
    errorEmptyCredentials: "Hata: Lütfen kullanıcı adı ve şifre giriniz.",
    errorConnectionFailed:
      "Bağlantı Hatası: Sunucuya bağlanılamıyor. İnternet bağlantınızı kontrol edin.",
    errorLoginFailed: "Giriş Başarısız: Kullanıcı adı veya şifre hatalı.",
    errorEmptyFields: "Hata: Lütfen tüm alanları doldurunuz.",
    errorPasswordMismatch: "Hata: Şifreler eşleşmiyor. Lütfen kontrol ediniz.",
    errorRegistrationFailed: "Kayıt Başarısız: Kayıt işlemi başarısız oldu.",
    welcomeMessage: "Hoşgeldiniz",
  },

  home: {
    airTemperature: "Hava Sıcaklığı",
    airHumidity: "Hava Nemi",
    timeToIrrigation: "Sulamaya Kalan Süre",
    soilMoisture: "Toprak Nemi",
    selectField: "Tarla Seçin",
    loading3DModel: "3D model yükleniyor...",
    dataSourceAWS: "AWS",
    dataSourceDemo: "DEMO",
    lastReading: "Son okuma",
    noFieldsTitle: "Bu çiftlikte henüz tarla yok",
    noFieldsSubtitle: "Başlamak için yeni bir tarla ekleyin",
    addField: "Tarla Ekle",
    fieldOverview: "Tarla Geneli",
    tapZoneHint: "Detay için bir bölge seçin",
    irrigation: "Sulama",
    now: "Şimdi",
    unitMin: "dk",
    unitHr: "sa",
    unitDay: "g",
    lastUpdated: "Son güncelleme",
  },

  disease: {
    noAnalysisYet: "Henüz analiz yok",
    noAnalysisSubtitle: "Yaprak fotoğrafı çekerek hastalık tespiti başlatın",
    takePhotoButton: "Fotoğraf çek",
    loadingResults: "Yükleniyor...",
    errorLoadingResults: "Hata: Sonuçlar yüklenemedi",
    sentForAnalysis:
      "Gönderildi: Yaprak analiz için gönderildi. Sonuçlar yaklaşık 20-30 saniye içinde hazır olacak.",
    errorSendingImage: "Hata: Görsel gönderilemedi",
    errorGeneric: "Hata: Bir şeyler ters gitti",
    deleteTitle: "Sil",
    deleteConfirmation:
      "Bu analiz sonucunu silmek istediğinizden emin misiniz?",
    deletedSuccessfully: "Başarıyla silindi",
    errorDeleting: "Hata: Silinirken bir hata oluştu",
    statusPending: "Bekleniyor",
    statusProcessing: "İşleniyor",
    statusCompleted: "Tamamlandı",
    statusFailed: "Başarısız",
    justNow: "Az önce",
    minutesAgo: "dk önce",
    hoursAgo: "saat önce",
    yesterday: "Dün",
    daysAgo: "gün önce",
    analyzingLeaf: "Yaprak analiz ediliyor...",
    confidence: "güven",
    analysisFailed: "Analiz başarısız oldu",
    waitingInQueue: "Analiz için sırada bekliyor",
    failedToSend: "Gönderilemedi",
    failedToSendSubtitle: "İnternet bağlantınızı kontrol edip tekrar deneyin",
    retryButton: "Tekrar dene",
    retrying: "Gönderiliyor...",
    retrySuccess: "Gönderildi",
    queuedForRetry: "Görsel sıraya alındı, daha sonra tekrar denenecek",
    allPredictions: "Tüm Tahminler",
    detailTitle: "Analiz Detayı",
    detailNoData: "Veri yok",
    detailConfidenceRaw: "confidence (ham)",
    detailConfidenceScore: "confidence_score (ham)",
    detailRecommendations: "Öneriler",
    detailTimestamps: "Zamanlar",
    detailDetectionId: "Tespit ID",
    detailCapturedAt: "Tarih",
    uncertainTitle: "Emin Değil",
    uncertainMessage:
      "Model bu fotoğraftan emin olamadı. Lütfen yaprağın daha net bir fotoğrafını çekin.",
    uncertainPossibleGuess: "Olası tahmin",
    feedbackPrompt: "Bu sonuç sizce ne kadar doğru?",
    feedbackThanks: "Teşekkürler — geri bildiriminiz kaydedildi",
    feedbackError: "Geri bildirim gönderilemedi",
    feedbackDefinitelyWrong: "Kesinlikle yanlış",
    feedbackLikelyWrong: "Sanırım yanlış",
    feedbackUnsure: "Bilmiyorum",
    feedbackLikelyCorrect: "Sanırım doğru",
    feedbackDefinitelyCorrect: "Kesinlikle doğru",
    correctionPrompt: "Sizce gerçek hastalık nedir?",
    correctionPickerTitle: "Gerçek hastalığı seçin",
    correctionCancel: "İptal",
    correctionConfirm: "Onayla",
    correctionDontKnow: "Bilmiyorum",
    correctionOther: "Diğer",
    correctionBacterialSpot: "Bakteriyel leke",
    correctionCornCommonRust: "Mısır pas hastalığı",
    correctionCornGrayLeafSpot: "Mısır gri yaprak lekesi",
    correctionCornNorthernLeafBlight: "Mısır kuzey yaprak yanıklığı",
    correctionEarlyBlight: "Erken yanıklık",
    correctionHealthy: "Sağlıklı",
    correctionLateBlight: "Geç yanıklık",
    correctionLeafMold: "Yaprak küfü",
    correctionMosaicVirus: "Mozaik virüsü",
    correctionPowderyMildew: "Külleme",
    correctionSeptoriaLeafSpot: "Septoria yaprak lekesi",
    correctionSpiderMites: "Kırmızı örümcek",
    correctionTargetSpot: "Hedef leke",
    correctionYellowLeafCurlVirus: "Sarı yaprak kıvırcık virüsü",
    foldersSectionTitle: "Takip Klasörleri",
    foldersEmpty: "Henüz aktif klasör yok. Bir hastalığı zamanla takip etmek için klasör oluşturun.",
    generalSectionTitle: "Genel Tespitler",
    showMore: "daha göster",
    folderCreateButton: "Yeni",
    folderCreateTitle: "Takip Klasörü Oluştur",
    folderCreateHelper: "Bölge seçin",
    folderCreateZoneLabel: "Bölge",
    folderCreateZoneLoadError: "Bölgeler yüklenemedi.",
    folderCreateNoZones: "Hiç bölge bulunamadı. Önce çiftlik / tarla / bölge yapınızı kurun.",
    folderCreateNameLabel: "Klasör Adı",
    folderCreateNamePlaceholder: "örn. Domates erken yanıklık takibi",
    folderCreateNamePlaceholderEmpty: "Önce bir bölge seçin",
    folderCreateConfirm: "Klasörü Oluştur",
    folderCreatePickZone: "Lütfen önce bir bölge seçin.",
    folderCreateNameRequired: "Klasör adı zorunlu.",
    folderCreateSuccess: "Klasör oluşturuldu.",
    folderCreateDuplicateName: "Bu bölgenin aktif ekiminde aynı isimli bir klasör zaten var.",
    folderCreateNoActivePlanting: "Bu bölgede aktif bir ekim yok.",
    folderCreateGenericError: "Klasör oluşturulamadı.",
    folderPhotoSingular: "fotoğraf",
    folderPhotoPlural: "fotoğraf",
    folderDetailLoadError: "Klasör yüklenemedi.",
    folderDetailTarget: "Hedef",
    folderDetailStarted: "Başlangıç:",
    folderDetailTimeline: "Zaman Çizelgesi",
    folderDetailEmpty: "Henüz fotoğraf yok.",
    folderDeactivateTitle: "Klasörü Arşivle?",
    folderDeactivateConfirmation: "{name} arşivlenecek. Fotoğraflar ve tespitler korunur.",
    folderDeactivateConfirm: "Arşivle",
    folderDeactivateSuccess: "Klasör arşivlendi.",
    folderDeactivateError: "Klasör arşivlenemedi.",
    folderAddPhotoTo: "Klasöre fotoğraf ekle:",
    folderCameraAddingTo: "Eklenecek klasör:",
    sampleButton: "ÖRNEK",
    sampleSheetTitle: "Demo örnek görüntü seç",
    sampleResolveError: "Örnek görüntü yüklenemedi.",
    demoHardwareUnavailable: "Donanım kurulumu demo modunda kullanılamaz.",
  },

  camera: {
    permissionTitle: "Kamera İzni",
    permissionButton: "İzin Ver",
    permissionDeniedTitle: "Kamera Erişimi Reddedildi",
    permissionDeniedMessage:
      "Bu özelliği kullanmak için cihaz ayarlarında kamera izinlerini etkinleştirin.",
    retryButton: "Yeniden Dene",
    galleryError: "Hata: Galeri resmi seçilemedi. Lütfen tekrar deneyin.",
    cameraNotReady: "Hata: Kamera hazır değil.",
    photoError: "Hata: Fotoğraf çekilemedi. Lütfen tekrar deneyin.",
    sendTitle: "Gönder",
    sendConfirmation: "Resmi analiz için göndermek istiyor musunuz?",
    sentSuccess: "Gönderildi: Resim analiz için gönderildi.",
    liveCameraUnavailable: "Canlı kamera kullanılamıyor",
    liveCameraMessage:
      "Cihaz kameranızı kullanmak için izin verin veya albümden seçin.",
    systemPermissionDescription:
      "Bitki hastalığı tespiti için kamera erişimi gereklidir.",
    cancelButton: "İptal",
    sendButton: "Gönder",
    liveMode: "Canlı Tarama",
    photoMode: "Fotoğraf",
    liveScanLoading: "Model yükleniyor...",
    liveScanUncertain: "Belirsiz — net fotoğraf çekin",
    liveScanAdjustLight: "Işığı ayarlayın",
    localResultBanner: "Cihaz sonucu: {class} (%{conf})",
    retakeButton: "Tekrar Çek",
    closeButton: "Kapat",
  },

  timetable: {
    title: "Çizelge",
    noFieldSelected: "Tarla seçilmedi",
    loadingSensorData: "Sensör verileri yükleniyor...",
    loadFailed: "Veri Yüklenemedi",
    noDataYet: "Henüz veri yok",
    connectionError: "Bağlantı hatası: ",
    unknownError: "Bilinmeyen hata",
    pullToRefresh: "Yenilemek için aşağı çekin",
    last72Hours: "Son 72 Saat",
    table: "Tablo",
    charts: "Grafikler",
    temperature: "Sıcaklık (°C)",
    temperatureShort: "Sıcaklık",
    humidity: "Nem (%)",
    humidityShort: "Nem",
    soilMoisture: "Toprak Nemi (%)",
    soilMoistureShort: "Toprak Nemi",
    shareCSV: "CSV Paylaş",
    sensorData: "Sensör Verileri",
    total: "Toplam",
    showing: "Gösterilen",
    time: "Zaman",
    node: "Düğüm",
    interpolated: "Ara Değerli",
    pointsOf: "nokta",
    points: "nokta",
    tapToView: "Değerleri görmek için dokun",
    tapDotsForValues: "Noktalara dokun",
    lastUpdated: "Son güncelleme",
    range6h: "6 Saat",
    range24h: "24 Saat",
    range3d: "3 Gün",
    range1w: "1 Hafta",
    range1m: "1 Ay",
    sensorDump: "Sensör Dökümü",
    hours: "Saat",
    dateTime: "Tarih/Saat",
    rawMoisture: "Ham Nem",
    filters: "Filtreler",
    timeRange: "Zaman Aralığı",
    metrics: "Ölçümler",
    zones: "Bölgeler",
    selectAll: "Tümünü Seç",
    applyFilters: "Uygula",
    resetFilters: "Sıfırla",
    aggregationMode: "Gruplama",
    modePerNode: "Düğüm Bazında",
    modePerZone: "Bölge Ortalaması",
    modeFieldAvg: "Tarla Ortalaması",
    allHidden: "Tüm seriler gizli — efsane çiplerine dokunarak açın",
    summary: "Özet",
    avg: "Ort",
    min: "Min",
    max: "Maks",
    readings: "okuma",
    custom: "Özel…",
    selectNone: "Hiçbiri",
  },

  nav: {
    carbon: "Karbon",
    timetable: "Çizelge",
    home: "Ana Sayfa",
    disease: "Hastalık",
    settings: "Hesap",
  },

  settings: {
    title: "Hesap",
    account: "Hesap",
    role: "Rol",
    roleFarmer: "Çiftçi",
    roleAdmin: "Yönetici",
    roleUser: "Kullanıcı",
    farmManagement: "Çiftlik Yönetimi",
    activeFarm: "Aktif Çiftlik",
    noFarmSelected: "Henüz çiftlik seçilmedi",
    noFarmCreated: "Henüz çiftlik oluşturulmadı",
    fieldsConnected: "tarla bağlı",
    createNewFarm: "Yeni Çiftlik Oluştur",
    deleteFarm: "Çiftliği Sil",
    deleteFarmConfirmTitle: "Çiftliği Sil",
    deleteFarmConfirmMessage: "Bu çiftlik ve tüm tarlalar kalıcı olarak silinecek. Bu işlem geri alınamaz.",
    deleteField: "Tarlayı Sil",
    deleteFieldConfirmTitle: "Tarlayı Sil",
    deleteFieldConfirmMessage: "Bu tarla kalıcı olarak silinecek. Bu işlem geri alınamaz.",
    deleteConfirm: "Sil",
    fieldManagement: "Tarla Yönetimi",
    noFields: "Bu çiftlikte henüz tarla yok",
    hardwareSubtitle: "Sensör ve gateway bağlantılarını yönet",
    appPreferences: "Uygulama Ayarları",
    privacySection: "Gizlilik ve Katkı",
    themeMode: "Tema Modu",
    themeLight: "Açık",
    themeDark: "Koyu",
    themeSystem: "Sistem",
    language: "Dil",
    languageTurkish: "Türkçe",
    languageEnglish: "English",
    datasetConsentTitle: "TARAS'ı geliştirmeye yardım et",
    datasetConsentSubtitle: "İzin verirsen, analize gönderdiğin fotoğraflar sonuçlarımızı iyileştirmek için kullanılabilir.",
    editProfile: "Düzenle",
    editProfileTitle: "Profili Düzenle",
    usernameLabel: "Kullanıcı Adı",
    emailLabel: "E-posta",
    passwordLabel: "Yeni Şifre",
    passwordPlaceholder: "Değiştirmek istemiyorsan boş bırak",
    saveChanges: "Kaydet",
    profileUpdated: "Profil güncellendi",
    profileUpdateFailed: "Profil güncellenemedi",
    datasetConsentDisableTitle: "Emin misin?",
    datasetConsentDisableMessage: "Bundan sonra gönderdiğin fotoğraflar TARAS'ı iyileştirmek için kullanılmayacak. Daha önce gönderilenler için verdiğin izin geçerliliğini korur.",
    datasetConsentDisableConfirm: "Kapat",
    logout: "Çıkış Yap",
  },

  hardware: {
    title: "Donanım Kurulumu",
    addGateway: "Gateway Ekle",
    addGatewayDesc: "BLE ile yeni gateway cihazı yapılandır",
    addSensorNode: "Sensör Düğümü Ekle",
    addSensorNodeDesc: "Gateway üzerinden yeni sensör eşleştir",
    selectFarm: "Tarla Seçin",
    scanningGateways: "Gateway Aranıyor",
    noGatewaysFound: "Gateway bulunamadı",
    enterWifi: "WiFi Bilgilerini Girin",
    ssidPlaceholder: "Ağ adı (SSID)",
    passwordPlaceholder: "WiFi Şifresi",
    configureGateway: "Gateway Yapılandır",
    provisioning: "Yapılandırılıyor...",
    gatewayConfigured: "Gateway Yapılandırıldı",
    selectGateway: "Gateway Seçin",
    gatewayOffline: "Çevrimdışı",
    selectZone: "Bölge Seçin",
    startPairing: "Eşleştirmeyi Başlat",
    searchingNodes: "Sensör Aranıyor",
    nodeFound: "Sensör Bulundu",
    approve: "Onayla",
    decline: "Reddet",
    autoRejectNotice: "Otomatik red",
    noZonesFound: "Bölge bulunamadı",
    nodePaired: "Sensör Eşleştirildi",
    pairingTimeout: "Süre doldu, sensör bulunamadı",
    bleDisabled: "Bluetooth kapalı, lütfen açın",
    blePermissionNeeded: "Bluetooth izni gerekli",
    connectionLost: "Bağlantı kesildi",
    retry: "Tekrar Dene",
    powerOnSensor: "Sensör düğümünü şimdi açın...",
    done: "Tamam",
    registering: "Kaydediliyor...",
    writingConfig: "Yapılandırma yazılıyor...",
    waitingGateway: "Gateway bekleniyor...",
    testingWifi: "WiFi test ediliyor...",
    wifiFailed: "WiFi bağlantısı başarısız. SSID ve şifreyi kontrol edin.",
    backendUnreachable: "Backend sunucusuna ulaşılamıyor. İnternet bağlantısını kontrol edin.",
    provisionFailed: "Yapılandırma başarısız.",
    online: "Çevrimiçi",
    offline: "Çevrimdışı",
    sensors: "sensör",
    firmwareVersion: "Yazılım",
    firmwareUpToDate: "Güncel",
    updateAvailable: "Güncelleme mevcut",
    updateConfirmTitle: "Yazılım Güncellemesi",
    updateConfirmMessage: "Gateway v{version} sürümüne güncellensin mi? Gateway yeniden başlatılacak.",
    updating: "Yazılım güncelleniyor...",
    updateSuccess: "Yazılım başarıyla güncellendi!",
    updateFailed: "Yazılım güncellemesi başarısız",
  },

  chat: {
    title: "TarasMobil Asistanı",
    placeholder: "Mesajınızı yazın...",
    newChat: "Yeni Sohbet",
    tapToOpen: "Sohbeti açmak için dokunun",
    history: "Geçmiş Sohbetler",
    historyEmpty: "Henüz sohbet geçmişi yok",
    readMore: "Tümünü gör",
  },

  errors: {
    visualization3DError: "3D Görselleştirme Hatası",
    retryButton: "Tekrar Dene",
    showDetails: "Detayları Göster",
    hideDetails: "Detayları Gizle",
    errorDetails: "Hata Detayları:",
    preparing: "Hazırlanıyor...",
    checking3DModule: "3D modül kontrol ediliyor...",
    cannotLoad3D: "3D görselleştirme yüklenemedi",
    hideDebug: "Debug Gizle",
    showDebug: "Debug Göster",
    loading3D: "3D görselleştirme yükleniyor...",
  },

  nodePopup: {
    soilMoisture: "Toprak Nemi",
    airTemperature: "Hava Sıcaklığı",
    airHumidity: "Hava Nemi",
    sensor: "Sensör",
  },

  carbon: {
    title: "Karbon Ayak İzi",
    comingSoon: "Yakında...",
    loadError: "Veriler yüklenemedi",
    typeRequired: "Lütfen bir aktivite tipi seçin",
    amountRequired: "Lütfen bir miktar girin",
    logSuccess: "Kayıt eklendi",
    logError: "Kayıt eklenemedi",
    kgCO2: "kg CO₂",
    deleteConfirmTitle: "Kaydı Sil",
    deleteConfirmMessage: "Bu kaydı silmek istediğinize emin misiniz?",
    deleteSuccess: "Kayıt silindi",
    deleteError: "Kayıt silinemedi",
    loadingFarms: "Çiftlikler yükleniyor...",
    noFarmFound: "Çiftlik bulunamadı",
    summaryTitle: "Toplam Emisyon",
    addLog: "Yeni Kayıt",
    selectActivityType: "Aktivite tipi seçin",
    noData: "Veri yok",
    amount: "Miktar",
    date: "Tarih",
    notes: "Notlar",
    notesPlaceholder: "Opsiyonel not ekleyin...",
    logActivity: "Kaydet",
    recentLogs: "Son Kayıtlar",
    noLogs: "Henüz kayıt yok",
    noLogsSubtitle: "Aktivite kaydı ekleyerek karbon ayak izinizi takip edin",
    categoryFuel: "Yakıt",
    categoryFertilizer: "Gübre",
    categoryElectricity: "Elektrik",
  },

  notifications: {
    title: "Bildirimler",
    empty: "Henüz bildirim yok",
  },

  irrigation: {
    welcome: "Merhaba",
    nextIrrigation: "Sonraki Sulama",
    soilMoisture: "Toprak Nemi",
    zone: "Bölge",
    detail: "Sulama Detayı",
    recommendedAmount: "Önerilen Miktar",
    recommendedTime: "Önerilen Zaman",
    currentMoisture: "Mevcut Nem",
    didIrrigateAmount: "Önerilen miktarda suladınız mı?",
    didIrrigateTime: "Önerilen zamanda suladınız mı?",
    actualAmount: "Gerçek Miktar (ml)",
    actualTime: "Gerçek Sulama Zamanı",
    enterAmount: "Miktarı girin",
    selectDateTime: "Tarih ve saat seçin",
    save: "Kaydet",
    saved: "Kaydedildi!",
    saveFailed: "Kayıt başarısız",
    history: "Sulama Geçmişi",
    noHistory: "Henüz sulama kaydı yok",
    noRecommendation: "Öneri mevcut değil",
    ml: "ml",
    tapForDetails: "Detaylar için dokunun",
    targetMoisture: "Hedef Nem",
    crop: "Mahsul",
    growthStage: "Büyüme Aşaması",
    status: "Durum",
    urgencyLevel: "Aciliyet Seviyesi",
    reasoning: "Gerekçe",
    recommendationTime: "Öneri Zamanı",
    noActiveRecommendation: "Aktif öneri yok",
    noActiveRecommendationSub: "Bu bölge için bekleyen sulama önerisi bulunmuyor.",
    noIrrigationNeeded: "Sulama gerekmiyor",
    noIrrigationNeededSub: "Sistem kontrol etti, şu an sulama gerekmiyor.",
    lastChecked: "Son kontrol",
    confirmIrrigationQuestion: "Sulama önerisini tam olarak uyguladınız mı?",
    yesFollowedExactly: "Evet, öneri miktarı ve zamanında suladım",
    noUsedDifferent: "Hayır, farklı değerler kullandım",
    enterActualValues: "Gerçek değerleri girin",
    amountQuestion: "Sulamayı önerdiğimiz miktarda mı yaptınız?",
    timeQuestion: "Sulamayı önerdiğimiz zamanda mı yaptınız?",
    amountInvalid: "Geçerli bir miktar girin (0'dan büyük)",
    pendingRecommendation: "Sulama önerisi mevcut",
    noSuggestion: "Yeni öneri yok",
    urgencyHigh: "Yüksek",
    urgencyMedium: "Orta",
    urgencyLow: "Düşük",
    urgencyCritical: "Kritik",
    irrigationRecommended: "sulama öneriliyor",
    whyRecommended: "Neden önerildi?",
    defaultReasoning: "Toprak nemi hedef seviyenin altında olduğu için sulama önerildi. Miktar, bölge kalibrasyonuna göre hesaplandı.",
    lastIrrigation: "Son Sulama",
    manualIrrigation: "Manuel Sulama",
    manualIrrigationDesc: "Öneri olmadan sulama kaydı oluşturun",
    manualAmount: "Sulama Miktarı (ml)",
    manualDuration: "Sulama Süresi (dk)",
    manualTime: "Sulama Zamanı",
    manualSaved: "Manuel sulama kaydedildi!",
    manualSaveFailed: "Manuel sulama kaydedilemedi",
    recommendButton: "Sulama Öner",
    recommendationRunning: "Hesaplanıyor...",
    recommendationGenerated: "Sulama önerileri oluşturuldu",
    recommendationFailed: "Öneri oluşturulamadı",
    noZonesFound: "Bu tarlada bölge bulunamadı",
    noPlantingError: "Bölgelerde aktif ekim kaydı yok. Önce ekim ekleyin.",
    zonesSuccess: "bölge başarılı",
    zonesFailed: "başarısız",
    enterDuration: "Süreyi girin",
    cancel: "İptal",
  },

  addField: {
    addNewField: "+ Yeni Tarla Ekle",
    selectFieldType: "Tarla Tipi Seçin",
    greenhouse: "Sera",
    greenhouseDesc: "Poligon sınırı ve bölgeler çizin",
    potArea: "Saksı Alanı",
    potAreaDesc: "Saksı sayısını girin, otomatik yerleşim",
    fieldName: "Tarla Adı",
    fieldNamePlaceholder: "örn. Sera 1",
    cropName: "Mahsul Tipi",
    cropNamePlaceholder: "örn. Domates",
    next: "İleri",
    drawBoundary: "Dış Sınırı Çizin",
    drawBoundaryHint: "Dokunarak en az 3 nokta ekleyin",
    drawZones: "Bölgeleri Çizin",
    drawZonesHint: "Sınır içinde bölge poligonları çizin",
    addZone: "Bölge Ekle",
    zoneName: "Bölge Adı",
    zoneNamePlaceholder: "örn. Bölge 1",
    closePolygon: "Poligonu Kapat",
    undoPoint: "Geri Al",
    clearAll: "Temizle",
    deleteZone: "Sil",
    potCount: "Saksı Sayısı",
    potCountPlaceholder: "örn. 20",
    potCountHint: "Her saksı bir bölge olarak oluşturulur",
    preview: "Ön İzleme",
    fieldNameLabel: "Tarla Adı",
    fieldTypeLabel: "Tarla Tipi",
    zoneCountLabel: "Bölge Sayısı",
    potCountLabel: "Saksı Sayısı",
    cropLabel: "Mahsul",
    createField: "Tarlayı Oluştur",
    creating: "Oluşturuluyor...",
    fieldCreated: "Tarla başarıyla oluşturuldu!",
    fieldCreateError: "Tarla oluşturulamadı",
    nameRequired: "Tarla adı zorunludur",
    minPoints: "En az 3 nokta gereklidir",
    minOneZone: "En az 1 bölge gereklidir",
    potCountPositive: "Saksı sayısı pozitif bir sayı olmalıdır",
    potCountMax: "En fazla 32 saksı eklenebilir",
    zoneNameRequired: "Bölge adı zorunludur",
    splitZonesHint: "Bölmek istediğiniz iki noktaya dokunun",
    splitFailed: "Bölme başarısız — farklı noktalar seçin",
    cancelSplit: "İptal",
    selectSecondPoint: "İkinci noktayı seçin",
    plantingTitle: "Ekim Bilgileri",
    plantingHint: "Her bölge için mahsul ve ekim tarihini girin",
    plantingDateLabel: "Ekim Tarihi",
    plantingDateRequired: "Tüm bölgelerde ekim tarihi zorunludur",
    selectCrop: "Mahsul seçin (opsiyonel)",
    selectDate: "Tarih seçin",
    noCrops: "Henüz mahsul tanımlanmamış",
    growthDays: "gün",
  },
  register: {
    stepUserInfo: "Hesap Bilgileri",
    usernamePlaceholder: "Kullanıcı Adı",
    emailPlaceholder: "E-posta",
    passwordPlaceholder: "Şifre",
    confirmPasswordPlaceholder: "Şifre Tekrar",
    roleLabel: "Rol",
    roleFarmer: "Çiftçi",
    roleAdmin: "Yönetici",
    createAccountButton: "Hesap Oluştur",
    backToLogin: "Zaten hesabınız var mı? Giriş Yapın",
    connectingToServer: "Sunucuya bağlanılıyor...",
    registering: "Hesap oluşturuluyor...",
    errorEmptyFields: "Lütfen tüm alanları doldurun",
    errorInvalidEmail: "Geçerli bir e-posta adresi girin",
    errorPasswordTooShort: "Şifre en az 8 karakter olmalıdır",
    errorPasswordMismatch: "Şifreler eşleşmiyor",
    errorRegistrationFailed: "Kayıt başarısız oldu",
    errorConnectionFailed: "Sunucuya bağlanılamadı",
  },
  farm: {
    addFarm: "Çiftlik Ekle",
    farmNamePlaceholder: "Çiftlik Adı",
    createFarm: "Çiftlik Oluştur",
    creating: "Oluşturuluyor...",
    farmCreated: "Çiftlik başarıyla oluşturuldu!",
    farmCreateError: "Çiftlik oluşturulamadı",
    farmNameRequired: "Çiftlik adı zorunludur",
    selectLocation: "Konum Seçin",
    selectLocationHint: "Haritada çiftlik konumuna dokunun",
    latitude: "Enlem",
    longitude: "Boylam",
    altitude: "Yükseklik (m)",
    altitudeHint: "Koordinat seçildikten sonra otomatik doldurulur",
    altitudeFetchFailed: "Yükseklik otomatik alınamadı. Lütfen elle girin.",
    fetchingAltitude: "Yükseklik alınıyor...",
    locationRequired: "Haritadan konum seçmelisiniz",
    altitudeRequired: "Yükseklik değeri gereklidir",
    searchPlaceholder: "İl veya ilçe ara...",
    searchNoResults: "Sonuç bulunamadı",
  },
};

const en: StringDictionary = {
  common: {
    loading: "Loading...",
    error: "Error",
    success: "Success",
    cancel: "Cancel",
    yes: "Yes",
    no: "No",
    ok: "OK",
    send: "Send",
    delete: "Delete",
    retry: "Retry",
    back: "Back",
    share: "Share",
    close: "Close",
    save: "Save",
  },

  login: {
    emailPlaceholder: "Email",
    usernamePlaceholder: "Username",
    passwordPlaceholder: "Password",
    confirmPasswordPlaceholder: "Confirm Password",
    farmNamePlaceholder: "Farm Name",
    loginButton: "Log In",
    registerButton: "Sign Up",
    skipButton: "Continue with Demo Mode",
    localDemoButton: "Local Demo",
    localDemoSubtitle: "Fully offline — no account needed",
    awsDemoButton: "Live Server Demo",
    awsDemoSubtitle: "Sample cloud account with live sensor data",
    demoOnlyHeading: "Try TARAS",
    demoOnlyBody: "Choose how to explore TARAS",
    switchToRegister: "Don't have an account? Sign Up",
    switchToLogin: "Already have an account? Log In",
    connectingToServer: "Connecting to server...",
    serverOffline: "Server offline",
    loggingIn: "Logging in...",
    errorEmptyCredentials: "Error: Please enter username and password.",
    errorConnectionFailed:
      "Connection Error: Cannot connect to server. Please check your internet connection.",
    errorLoginFailed: "Login Failed: Invalid username or password.",
    errorEmptyFields: "Error: Please fill in all fields.",
    errorPasswordMismatch: "Error: Passwords do not match. Please check.",
    errorRegistrationFailed:
      "Registration Failed: Registration was unsuccessful.",
    welcomeMessage: "Welcome",
  },

  home: {
    airTemperature: "Air Temperature",
    airHumidity: "Air Humidity",
    timeToIrrigation: "Time to Irrigation",
    soilMoisture: "Soil Moisture",
    selectField: "Select Field",
    loading3DModel: "Loading 3D model...",
    dataSourceAWS: "AWS",
    dataSourceDemo: "DEMO",
    lastReading: "Last reading",
    noFieldsTitle: "No fields in this farm yet",
    noFieldsSubtitle: "Add a new field to get started",
    addField: "Add Field",
    fieldOverview: "Field Overview",
    tapZoneHint: "Tap a zone for details",
    irrigation: "Irrigation",
    now: "Now",
    unitMin: "m",
    unitHr: "h",
    unitDay: "d",
    lastUpdated: "Last updated",
  },

  disease: {
    noAnalysisYet: "No analysis yet",
    noAnalysisSubtitle: "Take a leaf photo to start disease detection",
    takePhotoButton: "Take photo",
    loadingResults: "Loading...",
    errorLoadingResults: "Error: Could not load results",
    sentForAnalysis:
      "Sent: Leaf sent for analysis. Results will be ready in approximately 20-30 seconds.",
    errorSendingImage: "Error: Could not send image",
    errorGeneric: "Error: Something went wrong",
    deleteTitle: "Delete",
    deleteConfirmation: "Are you sure you want to delete this analysis result?",
    deletedSuccessfully: "Successfully deleted",
    errorDeleting: "Error: An error occurred while deleting",
    statusPending: "Pending",
    statusProcessing: "Processing",
    statusCompleted: "Completed",
    statusFailed: "Failed",
    justNow: "Just now",
    minutesAgo: "min ago",
    hoursAgo: "hours ago",
    yesterday: "Yesterday",
    daysAgo: "days ago",
    analyzingLeaf: "Analyzing leaf...",
    confidence: "confidence",
    analysisFailed: "Analysis failed",
    waitingInQueue: "Waiting in queue for analysis",
    failedToSend: "Couldn't send",
    failedToSendSubtitle: "Check your connection and try again",
    retryButton: "Retry",
    retrying: "Sending...",
    retrySuccess: "Sent",
    queuedForRetry: "Image queued — will retry later",
    allPredictions: "All Predictions",
    detailTitle: "Analysis Detail",
    detailNoData: "No data",
    detailConfidenceRaw: "confidence (raw)",
    detailConfidenceScore: "confidence_score (raw)",
    detailRecommendations: "Recommendations",
    detailTimestamps: "Timestamps",
    detailDetectionId: "Detection ID",
    detailCapturedAt: "Captured",
    uncertainTitle: "Not Confident",
    uncertainMessage:
      "The model was not confident about this photo. Please take a clearer shot of the leaf.",
    uncertainPossibleGuess: "Possible guess",
    feedbackPrompt: "How accurate was this result?",
    feedbackThanks: "Thanks — your feedback was recorded",
    feedbackError: "Could not submit feedback",
    feedbackDefinitelyWrong: "Definitely wrong",
    feedbackLikelyWrong: "I think wrong",
    feedbackUnsure: "Don't know",
    feedbackLikelyCorrect: "I think true",
    feedbackDefinitelyCorrect: "Definitely true",
    correctionPrompt: "What do you think it actually is?",
    correctionPickerTitle: "Pick the actual disease",
    correctionCancel: "Cancel",
    correctionConfirm: "Confirm",
    correctionDontKnow: "Don't know",
    correctionOther: "Other",
    correctionBacterialSpot: "Bacterial spot",
    correctionCornCommonRust: "Corn common rust",
    correctionCornGrayLeafSpot: "Corn gray leaf spot",
    correctionCornNorthernLeafBlight: "Corn northern leaf blight",
    correctionEarlyBlight: "Early blight",
    correctionHealthy: "Healthy",
    correctionLateBlight: "Late blight",
    correctionLeafMold: "Leaf mold",
    correctionMosaicVirus: "Mosaic virus",
    correctionPowderyMildew: "Powdery mildew",
    correctionSeptoriaLeafSpot: "Septoria leaf spot",
    correctionSpiderMites: "Spider mites",
    correctionTargetSpot: "Target spot",
    correctionYellowLeafCurlVirus: "Yellow leaf curl virus",
    foldersSectionTitle: "Tracking Folders",
    foldersEmpty: "No active folders yet. Create one to track a disease over time.",
    generalSectionTitle: "General Detections",
    showMore: "more",
    folderCreateButton: "New",
    folderCreateTitle: "Create Tracking Folder",
    folderCreateHelper: "Select a zone",
    folderCreateZoneLabel: "Zone",
    folderCreateZoneLoadError: "Failed to load zones.",
    folderCreateNoZones: "No zones found. Set up your farm / field / zone structure first.",
    folderCreateNameLabel: "Folder Name",
    folderCreateNamePlaceholder: "e.g. Tomato early blight watch",
    folderCreateNamePlaceholderEmpty: "Pick a zone first",
    folderCreateConfirm: "Create Folder",
    folderCreatePickZone: "Please pick a zone first.",
    folderCreateNameRequired: "Folder name is required.",
    folderCreateSuccess: "Folder created.",
    folderCreateDuplicateName: "A folder with this name already exists for this zone's planting.",
    folderCreateNoActivePlanting: "This zone has no active planting.",
    folderCreateGenericError: "Could not create folder.",
    folderPhotoSingular: "photo",
    folderPhotoPlural: "photos",
    folderDetailLoadError: "Could not load folder.",
    folderDetailTarget: "Target",
    folderDetailStarted: "Started",
    folderDetailTimeline: "Timeline",
    folderDetailEmpty: "No photos yet.",
    folderDeactivateTitle: "Archive Folder?",
    folderDeactivateConfirmation: "{name} will be archived. Photos and detections are preserved.",
    folderDeactivateConfirm: "Archive",
    folderDeactivateSuccess: "Folder archived.",
    folderDeactivateError: "Could not archive folder.",
    folderAddPhotoTo: "Add photo to",
    folderCameraAddingTo: "Adding to:",
    sampleButton: "SAMPLE",
    sampleSheetTitle: "Pick a demo sample image",
    sampleResolveError: "Could not load sample image.",
    demoHardwareUnavailable: "Hardware setup is not available in demo mode.",
  },

  camera: {
    permissionTitle: "Camera Permission",
    permissionButton: "Grant Permission",
    permissionDeniedTitle: "Camera Access Denied",
    permissionDeniedMessage:
      "Enable camera permissions in device settings to use this feature.",
    retryButton: "Retry",
    galleryError: "Error: Could not select gallery image. Please try again.",
    cameraNotReady: "Error: Camera is not ready.",
    photoError: "Error: Could not take photo. Please try again.",
    sendTitle: "Send",
    sendConfirmation: "Do you want to send the image for analysis?",
    sentSuccess: "Sent: Image sent for analysis.",
    liveCameraUnavailable: "Live camera unavailable",
    liveCameraMessage:
      "Grant permission to use your device camera or select from album.",
    systemPermissionDescription:
      "Camera access is required for plant disease detection.",
    cancelButton: "Cancel",
    sendButton: "Send",
    liveMode: "Live Scan",
    photoMode: "Photo",
    liveScanLoading: "Loading model...",
    liveScanUncertain: "Uncertain — hold steady or reframe",
    liveScanAdjustLight: "Adjust lighting",
    localResultBanner: "On-device: {class} ({conf}%)",
    retakeButton: "Retake",
    closeButton: "Close",
  },

  timetable: {
    title: "Timetable",
    noFieldSelected: "No field selected",
    loadingSensorData: "Loading sensor data...",
    loadFailed: "Load Failed",
    noDataYet: "No data yet",
    connectionError: "Connection error: ",
    unknownError: "Unknown error",
    pullToRefresh: "Pull down to refresh",
    last72Hours: "Last 72 Hours",
    table: "Table",
    charts: "Charts",
    temperature: "Temperature (°C)",
    temperatureShort: "Temperature",
    humidity: "Humidity (%)",
    humidityShort: "Humidity",
    soilMoisture: "Soil Moisture (%)",
    soilMoistureShort: "Soil Moisture",
    shareCSV: "Share CSV",
    sensorData: "Sensor Data",
    total: "Total",
    showing: "Showing",
    time: "Time",
    node: "Node",
    interpolated: "Interpolated",
    pointsOf: "points of",
    points: "points",
    tapToView: "Tap to view values",
    tapDotsForValues: "Tap dots for values",
    lastUpdated: "Last updated",
    range6h: "6 Hours",
    range24h: "24 Hours",
    range3d: "3 Days",
    range1w: "1 Week",
    range1m: "1 Month",
    sensorDump: "Sensor Dump",
    hours: "Hours",
    dateTime: "Date/Time",
    rawMoisture: "Raw Moisture",
    filters: "Filters",
    timeRange: "Time Range",
    metrics: "Metrics",
    zones: "Zones",
    selectAll: "Select All",
    applyFilters: "Apply",
    resetFilters: "Reset",
    aggregationMode: "Grouping",
    modePerNode: "Per Node",
    modePerZone: "Zone Average",
    modeFieldAvg: "Field Average",
    allHidden: "All series hidden — tap legend chips to show",
    summary: "Summary",
    avg: "Avg",
    min: "Min",
    max: "Max",
    readings: "readings",
    custom: "Custom…",
    selectNone: "None",
  },

  nav: {
    carbon: "Carbon",
    timetable: "Schedule",
    home: "Home",
    disease: "Disease",
    settings: "Account",
  },

  settings: {
    title: "Account",
    account: "Account",
    role: "Role",
    roleFarmer: "Farmer",
    roleAdmin: "Admin",
    roleUser: "User",
    farmManagement: "Farm Management",
    activeFarm: "Active Farm",
    noFarmSelected: "No farm selected",
    noFarmCreated: "No farm created yet",
    fieldsConnected: "fields connected",
    createNewFarm: "Create New Farm",
    deleteFarm: "Delete Farm",
    deleteFarmConfirmTitle: "Delete Farm",
    deleteFarmConfirmMessage: "This farm and all its fields will be permanently deleted. This action cannot be undone.",
    deleteField: "Delete Field",
    deleteFieldConfirmTitle: "Delete Field",
    deleteFieldConfirmMessage: "This field will be permanently deleted. This action cannot be undone.",
    deleteConfirm: "Delete",
    fieldManagement: "Field Management",
    noFields: "No fields in this farm yet",
    hardwareSubtitle: "Manage sensor and gateway connections",
    appPreferences: "App Preferences",
    privacySection: "Privacy & Improvement",
    themeMode: "Theme Mode",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    language: "Language",
    languageTurkish: "Türkçe",
    languageEnglish: "English",
    datasetConsentTitle: "Help improve TARAS",
    datasetConsentSubtitle: "If you allow it, photos you upload for analysis may be used to improve our results.",
    editProfile: "Edit",
    editProfileTitle: "Edit Profile",
    usernameLabel: "Username",
    emailLabel: "Email",
    passwordLabel: "New Password",
    passwordPlaceholder: "Leave blank to keep current",
    saveChanges: "Save",
    profileUpdated: "Profile updated",
    profileUpdateFailed: "Failed to update profile",
    datasetConsentDisableTitle: "Are you sure?",
    datasetConsentDisableMessage: "From now on, photos you upload won't be used to improve TARAS. Photos you've already sent keep the consent you gave at the time.",
    datasetConsentDisableConfirm: "Turn off",
    logout: "Log Out",
  },

  hardware: {
    title: "Hardware Setup",
    addGateway: "Add Gateway",
    addGatewayDesc: "Configure a new gateway device via BLE",
    addSensorNode: "Add Sensor Node",
    addSensorNodeDesc: "Pair a new sensor via gateway",
    selectFarm: "Select Farm",
    scanningGateways: "Scanning for Gateways",
    noGatewaysFound: "No gateways found",
    enterWifi: "Enter WiFi Credentials",
    ssidPlaceholder: "Network name (SSID)",
    passwordPlaceholder: "WiFi Password",
    configureGateway: "Configure Gateway",
    provisioning: "Configuring...",
    gatewayConfigured: "Gateway Configured",
    selectGateway: "Select Gateway",
    gatewayOffline: "Offline",
    selectZone: "Select Zone",
    startPairing: "Start Pairing",
    searchingNodes: "Searching for Sensors",
    nodeFound: "Sensor Found",
    approve: "Approve",
    decline: "Decline",
    autoRejectNotice: "Auto-decline",
    noZonesFound: "No zones found",
    nodePaired: "Sensor Paired",
    pairingTimeout: "Timed out, no sensor found",
    bleDisabled: "Bluetooth is off, please enable it",
    blePermissionNeeded: "Bluetooth permission required",
    connectionLost: "Connection lost",
    retry: "Retry",
    powerOnSensor: "Power on the sensor node now...",
    done: "Done",
    registering: "Registering...",
    writingConfig: "Writing configuration...",
    waitingGateway: "Waiting for gateway...",
    testingWifi: "Testing WiFi...",
    wifiFailed: "WiFi connection failed. Check SSID and password.",
    backendUnreachable: "Cannot reach backend server. Check internet connection.",
    provisionFailed: "Configuration failed.",
    online: "Online",
    offline: "Offline",
    sensors: "sensors",
    firmwareVersion: "Firmware",
    firmwareUpToDate: "Up to date",
    updateAvailable: "Update available",
    updateConfirmTitle: "Firmware Update",
    updateConfirmMessage: "Update gateway to v{version}? The gateway will restart.",
    updating: "Updating firmware...",
    updateSuccess: "Firmware updated successfully!",
    updateFailed: "Firmware update failed",
  },

  chat: {
    title: "TARAS Assistant",
    placeholder: "Type your message...",
    newChat: "New Chat",
    tapToOpen: "Tap to open chat",
    history: "Past Conversations",
    historyEmpty: "No conversation history yet",
    readMore: "Read more",
  },

  errors: {
    visualization3DError: "3D Visualization Error",
    retryButton: "Retry",
    showDetails: "Show Details",
    hideDetails: "Hide Details",
    errorDetails: "Error Details:",
    preparing: "Preparing...",
    checking3DModule: "Checking 3D module...",
    cannotLoad3D: "Could not load 3D visualization",
    hideDebug: "Hide Debug",
    showDebug: "Show Debug",
    loading3D: "Loading 3D visualization...",
  },

  nodePopup: {
    soilMoisture: "Soil Moisture",
    airTemperature: "Air Temperature",
    airHumidity: "Air Humidity",
    sensor: "Sensor",
  },

  carbon: {
    title: "Carbon Footprint",
    comingSoon: "Coming Soon...",
    loadError: "Failed to load data",
    typeRequired: "Please select an activity type",
    amountRequired: "Please enter an amount",
    logSuccess: "Log added",
    logError: "Failed to add log",
    kgCO2: "kg CO₂",
    deleteConfirmTitle: "Delete Log",
    deleteConfirmMessage: "Are you sure you want to delete this log?",
    deleteSuccess: "Log deleted",
    deleteError: "Failed to delete log",
    loadingFarms: "Loading farms...",
    noFarmFound: "No farm found",
    summaryTitle: "Total Emissions",
    addLog: "New Log",
    selectActivityType: "Select activity type",
    noData: "No data",
    amount: "Amount",
    date: "Date",
    notes: "Notes",
    notesPlaceholder: "Add an optional note...",
    logActivity: "Save",
    recentLogs: "Recent Logs",
    noLogs: "No logs yet",
    noLogsSubtitle: "Track your carbon footprint by adding activity logs",
    categoryFuel: "Fuel",
    categoryFertilizer: "Fertilizer",
    categoryElectricity: "Electricity",
  },

  notifications: {
    title: "Notifications",
    empty: "No notifications yet",
  },

  irrigation: {
    welcome: "Hello",
    nextIrrigation: "Next Irrigation",
    soilMoisture: "Soil Moisture",
    zone: "Zone",
    detail: "Irrigation Detail",
    recommendedAmount: "Recommended Amount",
    recommendedTime: "Recommended Time",
    currentMoisture: "Current Moisture",
    didIrrigateAmount: "Did you irrigate with the recommended amount?",
    didIrrigateTime: "Did you irrigate at the recommended time?",
    actualAmount: "Actual Amount (ml)",
    actualTime: "Actual Irrigation Time",
    enterAmount: "Enter amount",
    selectDateTime: "Select date and time",
    save: "Save",
    saved: "Saved!",
    saveFailed: "Save failed",
    history: "Irrigation History",
    noHistory: "No irrigation history yet",
    noRecommendation: "No recommendation available",
    ml: "ml",
    tapForDetails: "Tap for details",
    targetMoisture: "Target Moisture",
    crop: "Crop",
    growthStage: "Growth Stage",
    status: "Status",
    urgencyLevel: "Urgency Level",
    reasoning: "Reason",
    recommendationTime: "Recommendation Time",
    noActiveRecommendation: "No active recommendation",
    noActiveRecommendationSub: "There is no pending irrigation recommendation for this zone.",
    noIrrigationNeeded: "No irrigation needed",
    noIrrigationNeededSub: "System checked — no irrigation is required right now.",
    lastChecked: "Last checked",
    confirmIrrigationQuestion: "Did you follow the irrigation recommendation exactly?",
    yesFollowedExactly: "Yes, I irrigated with the recommended amount and time",
    noUsedDifferent: "No, I used different values",
    enterActualValues: "Enter your actual values",
    amountQuestion: "Did you irrigate with our recommended amount?",
    timeQuestion: "Did you irrigate at our recommended time?",
    amountInvalid: "Enter a valid amount (greater than 0)",
    pendingRecommendation: "Irrigation recommendation pending",
    noSuggestion: "No new irrigation suggestion",
    urgencyHigh: "High",
    urgencyMedium: "Medium",
    urgencyLow: "Low",
    urgencyCritical: "Critical",
    irrigationRecommended: "irrigation recommended",
    whyRecommended: "Why recommended?",
    defaultReasoning: "Irrigation was recommended because soil moisture is below the target level. The amount was calculated based on zone calibration.",
    lastIrrigation: "Last Irrigation",
    manualIrrigation: "Manual Irrigation",
    manualIrrigationDesc: "Log irrigation without a recommendation",
    manualAmount: "Irrigation Amount (ml)",
    manualDuration: "Irrigation Duration (min)",
    manualTime: "Irrigation Time",
    manualSaved: "Manual irrigation saved!",
    manualSaveFailed: "Manual irrigation save failed",
    recommendButton: "Recommend Irrigation",
    recommendationRunning: "Calculating...",
    recommendationGenerated: "Irrigation recommendations generated",
    recommendationFailed: "Failed to generate recommendations",
    noZonesFound: "No zones found in this field",
    noPlantingError: "No active planting in zones. Add a planting first.",
    zonesSuccess: "zones succeeded",
    zonesFailed: "failed",
    enterDuration: "Enter duration",
    cancel: "Cancel",
  },

  addField: {
    addNewField: "+ Add New Field",
    selectFieldType: "Select Field Type",
    greenhouse: "Greenhouse",
    greenhouseDesc: "Draw polygon boundary and zones",
    potArea: "Pot Area",
    potAreaDesc: "Enter pot count, auto-layout",
    fieldName: "Field Name",
    fieldNamePlaceholder: "e.g. Greenhouse 1",
    cropName: "Crop Type",
    cropNamePlaceholder: "e.g. Tomato",
    next: "Next",
    drawBoundary: "Draw Outer Boundary",
    drawBoundaryHint: "Tap to place at least 3 points",
    drawZones: "Draw Zones",
    drawZonesHint: "Draw zone polygons inside the boundary",
    addZone: "Add Zone",
    zoneName: "Zone Name",
    zoneNamePlaceholder: "e.g. Zone 1",
    closePolygon: "Close Polygon",
    undoPoint: "Undo",
    clearAll: "Clear",
    deleteZone: "Delete",
    potCount: "Pot Count",
    potCountPlaceholder: "e.g. 20",
    potCountHint: "Each pot will be created as a zone",
    preview: "Preview",
    fieldNameLabel: "Field Name",
    fieldTypeLabel: "Field Type",
    zoneCountLabel: "Zone Count",
    potCountLabel: "Pot Count",
    cropLabel: "Crop",
    createField: "Create Field",
    creating: "Creating...",
    fieldCreated: "Field created successfully!",
    fieldCreateError: "Failed to create field",
    nameRequired: "Field name is required",
    minPoints: "At least 3 points are required",
    minOneZone: "At least 1 zone is required",
    potCountPositive: "Pot count must be a positive number",
    potCountMax: "Maximum 32 pots allowed",
    zoneNameRequired: "Zone name is required",
    splitZonesHint: "Tap two points to split a zone",
    splitFailed: "Split failed — try different points",
    cancelSplit: "Cancel",
    selectSecondPoint: "Select second point",
    plantingTitle: "Planting Info",
    plantingHint: "Set crop and planting date for each zone",
    plantingDateLabel: "Planting Date",
    plantingDateRequired: "Planting date is required for all zones",
    selectCrop: "Select crop (optional)",
    selectDate: "Select date",
    noCrops: "No crops defined yet",
    growthDays: "days",
  },
  register: {
    stepUserInfo: "Account Details",
    usernamePlaceholder: "Username",
    emailPlaceholder: "Email",
    passwordPlaceholder: "Password",
    confirmPasswordPlaceholder: "Confirm Password",
    roleLabel: "Role",
    roleFarmer: "Farmer",
    roleAdmin: "Admin",
    createAccountButton: "Create Account",
    backToLogin: "Already have an account? Log In",
    connectingToServer: "Connecting to server...",
    registering: "Creating account...",
    errorEmptyFields: "Please fill in all required fields",
    errorInvalidEmail: "Please enter a valid email address",
    errorPasswordTooShort: "Password must be at least 8 characters",
    errorPasswordMismatch: "Passwords do not match",
    errorRegistrationFailed: "Registration failed",
    errorConnectionFailed: "Could not connect to server",
  },
  farm: {
    addFarm: "Add Farm",
    farmNamePlaceholder: "Farm Name",
    createFarm: "Create Farm",
    creating: "Creating...",
    farmCreated: "Farm created successfully!",
    farmCreateError: "Failed to create farm",
    farmNameRequired: "Farm name is required",
    selectLocation: "Select Location",
    selectLocationHint: "Tap on the map to pick farm location",
    latitude: "Latitude",
    longitude: "Longitude",
    altitude: "Altitude (m)",
    altitudeHint: "Auto-filled after selecting a coordinate",
    altitudeFetchFailed: "Could not fetch altitude automatically. Please enter it manually.",
    fetchingAltitude: "Fetching altitude...",
    locationRequired: "You must select a location on the map",
    altitudeRequired: "Altitude value is required",
    searchPlaceholder: "Search city or district...",
    searchNoResults: "No results found",
  },
};

export const strings: Record<Language, StringDictionary> = {
  tr,
  en,
};

export const getStrings = (language: Language): StringDictionary => {
  return strings[language];
};
