export interface MiniAppModule {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  entryUrl: string;
  route: string;
  requiredPermissions: string[];
  isEnabled: boolean;
  order: number;
  createdAt: string;
  category: string;
}

/**
 * Module registration request (used by dashboard)
 */
export interface ModuleRegistrationRequest {
  name: string;
  description: string;
  icon: string;
  color: string;
  entryUrl: string;
  route: string;
  requiredPermissions: string[];
  category: string;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
