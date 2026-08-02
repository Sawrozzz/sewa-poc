/**
 * Namespace & action constants — mirror of
 * `mini-app-sdk/src/constants/namespaces.constants.ts`.
 */

export const NAMESPACES = {
  AUTH: 'auth',
  PERMISSIONS: 'permissions',
  FLAGS: 'flags',
  CONFIG: 'config',
  NAVIGATION: 'navigation',
  PLATFORM: 'platform',
  DEVICE: 'device',
  API: 'api',
  STORAGE: 'storage',
  HTTP: 'http',
  EVENT: 'event',
  HANDSHAKE: 'handshake',
} as const;

export type Namespace = (typeof NAMESPACES)[keyof typeof NAMESPACES];

export const SDK_CAPABILITIES: readonly string[] = [
  NAMESPACES.AUTH,
  NAMESPACES.PERMISSIONS,
  NAMESPACES.FLAGS,
  NAMESPACES.CONFIG,
  NAMESPACES.NAVIGATION,
  NAMESPACES.PLATFORM,
  NAMESPACES.DEVICE,
  NAMESPACES.STORAGE,
  NAMESPACES.API,
  NAMESPACES.HTTP,
];

export const ACTIONS = {
  AUTH: { GET_USER: 'getUser', IS_AUTHENTICATED: 'isAuthenticated', LOGOUT: 'logout' },
  PERMISSIONS: { HAS: 'has', LIST: 'list' },
  FLAGS: { IS_ENABLED: 'isEnabled', GET_ALL: 'getAll' },
  CONFIG: { GET: 'get', GET_ALL: 'getAll' },
  NAVIGATION: { NAVIGATE: 'navigate', GET_CURRENT: 'getCurrent' },
  PLATFORM: { GET_TYPE: 'getType' },
  DEVICE: {
    LOCATION: 'location', CAMERA: 'camera', GALLERY: 'gallery',
    FILES: 'files', BIOMETRIC: 'biometric', NOTIFICATIONS: 'notifications',
    NETWORK: 'network', INFO: 'info', CONTACT: 'contact',
  },
  HTTP: { GET: 'get', POST: 'post', PUT: 'put', PATCH: 'patch', DELETE: 'delete' },
  STORAGE: { GET: 'get', SET: 'set', REMOVE: 'remove' },
  API: { REQUEST: 'request' },
  EVENT: { SUBSCRIBE: 'subscribe', UNSUBSCRIBE: 'unsubscribe', EMIT: 'emit' },
  HANDSHAKE: { CONNECT: 'connect' },
} as const;
