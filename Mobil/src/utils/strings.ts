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
    loginButton: string;
    registerButton: string;
    skipButton: string;
    localDemoButton: string;
    awsDemoButton: string;
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
  };

  // Disease Screen
  disease: {
    noAnalysisYet: string;
    noAnalysisSubtitle: string;
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
    allPredictions: string;
    detailTitle: string;
    detailNoData: string;
    detailConfidenceRaw: string;
    detailConfidenceScore: string;
    detailRecommendations: string;
    detailTimestamps: string;
    detailDetectionId: string;
    uncertainTitle: string;
    uncertainMessage: string;
    uncertainPossibleGuess: string;
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
    temperature: string;
    humidity: string;
    soilMoisture: string;
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
    themeMode: string;
    themeLight: string;
    themeDark: string;
    themeSystem: string;
    language: string;
    languageTurkish: string;
    languageEnglish: string;
    awsConnectionTest: string;
    logout: string;
    diagnosticsTitle: string;
    diagnosticsConfirmation: string;
    diagnosticsStart: string;
    diagnosticsCompleted: string;
    diagnosticsFailed: string;
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

  // Network Diagnostics
  networkDiag: {
    title: string;
    running: string;
    startButton: string;
    shareReport: string;
    infoHeader: string;
    bulletNetworkStatus: string;
    bulletDNS: string;
    bulletHTTP: string;
    bulletAPI: string;
    bulletSocketIO: string;
    lastRun: string;
    promptMessage: string;
    tip: string;
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
    loginButton: "Giriş Yap",
    registerButton: "Kayıt Ol",
    skipButton: "Demo modu ile devam et",
    localDemoButton: "Yerel Demo",
    awsDemoButton: "AWS Demo",
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
  },

  disease: {
    noAnalysisYet: "Henüz analiz yok",
    noAnalysisSubtitle: "Yaprak fotoğrafı çekerek hastalık tespiti başlatın",
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
    allPredictions: "Tüm Tahminler",
    detailTitle: "Analiz Detayı",
    detailNoData: "Veri yok",
    detailConfidenceRaw: "confidence (ham)",
    detailConfidenceScore: "confidence_score (ham)",
    detailRecommendations: "Öneriler",
    detailTimestamps: "Zamanlar",
    detailDetectionId: "Tespit ID",
    uncertainTitle: "Emin Değil",
    uncertainMessage:
      "Model bu fotoğraftan emin olamadı. Lütfen yaprağın daha net bir fotoğrafını çekin.",
    uncertainPossibleGuess: "Olası tahmin",
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
  },

  timetable: {
    title: "Çizelge",
    noFieldSelected: "Tarla seçilmedi",
    loadingSensorData: "Sensör verileri yükleniyor...",
    loadFailed: "Veri Yüklenemedi",
    noDataYet: "Bu tarla için henüz veri bulunmuyor",
    connectionError: "Bağlantı hatası: ",
    unknownError: "Bilinmeyen hata",
    pullToRefresh: "Yenilemek için aşağı çekin",
    last72Hours: "Son 72 Saat",
    table: "Tablo",
    temperature: "Sıcaklık (°C)",
    humidity: "Nem (%)",
    soilMoisture: "Toprak Nemi (%)",
    shareCSV: "CSV Paylaş",
    sensorData: "Sensör Verileri",
    total: "Toplam",
    showing: "Gösterilen",
    time: "Zaman",
    node: "Node",
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
  },

  nav: {
    carbon: "Karbon",
    timetable: "Çizelge",
    home: "Ana Sayfa",
    disease: "Hastalık",
    settings: "Ayarlar",
  },

  settings: {
    title: "Ayarlar",
    themeMode: "Tema Modu",
    themeLight: "Açık",
    themeDark: "Koyu",
    themeSystem: "Sistem",
    language: "Dil",
    languageTurkish: "Türkçe",
    languageEnglish: "English",
    awsConnectionTest: "AWS Bağlantı Testi",
    logout: "Çıkış Yap",
    diagnosticsTitle: "Ağ Tanılaması",
    diagnosticsConfirmation:
      "AWS sunucusuna bağlantıyı test etmek istiyor musunuz? Bu 30-60 saniye sürebilir.",
    diagnosticsStart: "Başlat",
    diagnosticsCompleted: "Tanılama Tamamlandı",
    diagnosticsFailed: "Hata: Tanılama başarısız oldu",
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

  networkDiag: {
    title: "Ağ Tanılaması",
    running: "Çalışıyor...",
    startButton: "Tanılama Başlat",
    shareReport: "Raporu Paylaş",
    infoHeader: "Bu araç AWS sunucunuza olan bağlantıyı test eder:",
    bulletNetworkStatus: "Ağ durumu",
    bulletDNS: "DNS çözümlemesi",
    bulletHTTP: "HTTP bağlantısı",
    bulletAPI: "API uç noktaları",
    bulletSocketIO: "Socket.IO bağlantısı",
    lastRun: "Son çalıştırma",
    promptMessage:
      'AWS bağlantınızı test etmek için\n"Tanılama Başlat" butonuna basın',
    tip: "İpucu: Raporu paylaşarak geliştirici ekibinizle veya Claude ile hata ayıklayabilirsiniz.",
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
    loginButton: "Log In",
    registerButton: "Sign Up",
    skipButton: "Continue with Demo Mode",
    localDemoButton: "Local Demo",
    awsDemoButton: "AWS Demo",
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
  },

  disease: {
    noAnalysisYet: "No analysis yet",
    noAnalysisSubtitle: "Take a leaf photo to start disease detection",
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
    allPredictions: "All Predictions",
    detailTitle: "Analysis Detail",
    detailNoData: "No data",
    detailConfidenceRaw: "confidence (raw)",
    detailConfidenceScore: "confidence_score (raw)",
    detailRecommendations: "Recommendations",
    detailTimestamps: "Timestamps",
    detailDetectionId: "Detection ID",
    uncertainTitle: "Not Confident",
    uncertainMessage:
      "The model was not confident about this photo. Please take a clearer shot of the leaf.",
    uncertainPossibleGuess: "Possible guess",
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
  },

  timetable: {
    title: "Timetable",
    noFieldSelected: "No field selected",
    loadingSensorData: "Loading sensor data...",
    loadFailed: "Load Failed",
    noDataYet: "No data available for this field yet",
    connectionError: "Connection error: ",
    unknownError: "Unknown error",
    pullToRefresh: "Pull down to refresh",
    last72Hours: "Last 72 Hours",
    table: "Table",
    temperature: "Temperature (°C)",
    humidity: "Humidity (%)",
    soilMoisture: "Soil Moisture (%)",
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
  },

  nav: {
    carbon: "Carbon",
    timetable: "Schedule",
    home: "Home",
    disease: "Disease",
    settings: "Settings",
  },

  settings: {
    title: "Settings",
    themeMode: "Theme Mode",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    language: "Language",
    languageTurkish: "Türkçe",
    languageEnglish: "English",
    awsConnectionTest: "AWS Connection Test",
    logout: "Log Out",
    diagnosticsTitle: "Network Diagnostics",
    diagnosticsConfirmation:
      "Do you want to test the connection to AWS server? This may take 30-60 seconds.",
    diagnosticsStart: "Start",
    diagnosticsCompleted: "Diagnostics Completed",
    diagnosticsFailed: "Error: Diagnostics failed",
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

  networkDiag: {
    title: "Network Diagnostics",
    running: "Running...",
    startButton: "Start Diagnostics",
    shareReport: "Share Report",
    infoHeader: "This tool tests the connection to your AWS server:",
    bulletNetworkStatus: "Network status",
    bulletDNS: "DNS resolution",
    bulletHTTP: "HTTP connection",
    bulletAPI: "API endpoints",
    bulletSocketIO: "Socket.IO connection",
    lastRun: "Last run",
    promptMessage:
      'Press "Start Diagnostics" button\nto test your AWS connection',
    tip: "Tip: Share the report with your developer team or Claude for debugging.",
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
};

export const strings: Record<Language, StringDictionary> = {
  tr,
  en,
};

export const getStrings = (language: Language): StringDictionary => {
  return strings[language];
};
