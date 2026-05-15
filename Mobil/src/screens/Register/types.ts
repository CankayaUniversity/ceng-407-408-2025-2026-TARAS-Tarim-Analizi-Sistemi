export interface RegisterFormState {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  roleId: number; // 2 = farmer (default), 1 = admin
}

export const INITIAL_REGISTER_STATE: RegisterFormState = {
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
  roleId: 2,
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
