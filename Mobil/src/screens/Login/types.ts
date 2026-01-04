export interface LoginScreenProps {
  theme: any;
  onLoginSuccess: (fullName: string) => void;
  onSkip: () => void;
}
