export interface RegisterFormState {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export const INITIAL_REGISTER_STATE: RegisterFormState = {
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export interface RegisterScreenProps {
  theme: any;
  onRegisterSuccess: (displayName: string) => void;
  onBackToLogin: () => void;
}

export interface RegisterStepProps {
  theme: any;
  state: RegisterFormState;
  onUpdate: (partial: Partial<RegisterFormState>) => void;
  onSubmit: () => void;
  onBack: () => void;
  isLoading?: boolean;
}
