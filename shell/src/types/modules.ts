/**
 * Mini App Module - Represents a citizen service module
 * controlled by the dashboard application.
 */
export interface MiniAppModule {
  /** Unique identifier (e.g., 'driving-license') */
  id: string;
  /** Display name shown to citizens */
  name: string;
  /** Short description */
  description: string;
  /** Icon (emoji or lucide icon name) */
  icon: string;
  /** Color theme for the module */
  color: string;
  /** Base URL where the module is hosted */
  entryUrl: string;
  /** Route path in the shell (e.g., '/mini/driving-license') */
  route: string;
  /** Required permissions to access */
  requiredPermissions: string[];
  /** Whether the module is enabled */
  isEnabled: boolean;
  /** Display order */
  order: number;
  /** When the module was added */
  createdAt: string;
  /** Category for grouping (transport, revenue, insurance, etc.) */
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
