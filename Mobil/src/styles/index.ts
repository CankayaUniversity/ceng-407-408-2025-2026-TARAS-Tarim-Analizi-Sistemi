import { StyleSheet } from 'react-native';

export const appStyles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, flexDirection: 'column' },

  header: { paddingHorizontal: 24, paddingVertical: 16 },
  headerTitle: { fontSize: 28, fontWeight: '700', letterSpacing: 0.5 },
  headerSubtitle: { fontSize: 13, marginTop: 6, fontWeight: '400' },

  spacer: { flex: 1 },
  canvasContainer: { flex: 1.2, overflow: 'hidden', backgroundColor: 'transparent' },

  bottomNavWrapper: { marginHorizontal: 12, marginBottom: 16, borderRadius: 16, overflow: 'hidden', elevation: 4 },
  bottomNav: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 8 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12 },
  navIcon: { marginBottom: 4 },
  navLabel: { fontSize: 11, fontWeight: '600' },

  fab: {
    position: 'absolute',
    right: 24,
    bottom: 90,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },

  loginContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  loginTitle: { fontSize: 32, fontWeight: '700', marginBottom: 8 },
  loginSubtitle: { fontSize: 14, textAlign: 'center', marginBottom: 24 },
  loginInput: { width: '100%', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, marginBottom: 12, fontSize: 16 },
  loginButton: { width: '100%', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  loginButtonText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  skipButtonText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },

  cameraContainer: { flex: 1, padding: 16 },
  cameraBorderContainer: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 3,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  cameraView: { flex: 1 },

  settingsContainer: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 20, borderBottomWidth: 1, marginBottom: 20 },
  settingLeft: { flexDirection: 'row', alignItems: 'center' },
  settingLabel: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  settingDesc: { fontSize: 12 },
  themeButtons: { flexDirection: 'row', gap: 8 },
  themeButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#ccc' },
  themeButtonText: { fontSize: 12, fontWeight: '600' },
  logoutButton: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  logoutButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  placeholderText: { fontSize: 24, fontWeight: '700', marginBottom: 6 },
  placeholderSub: { fontSize: 14 },
  primaryButton: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12 },
  primaryButtonText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
