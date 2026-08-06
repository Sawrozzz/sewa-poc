import type { MiniAppModule } from '@/types/modules';

const modulesStore: MiniAppModule[] = [
  {
    id: 'driving-license',
    name: 'Digital Driving License',
    description: 'Apply for, renew, and verify your digital driving license.',
    icon: '🚗',
    color: '#dc9a0d',
    entryUrl: 'http://localhost:3001/remoteEntry.js',
    route: '/mini-app/driving-license',
    requiredPermissions: ['driving:read'],
    isEnabled: true,
    order: 1,
    createdAt: '2025-01-15T00:00:00Z',
    category: 'Transport',
  },
  {
    id: 'revenue-license',
    name: 'Motor Revenue License',
    description: 'Check road tax status, pay annual revenue license fees.',
    icon: '📋',
    color: '#059669',
    entryUrl: 'http://localhost:3002/remoteEntry.js',
    route: '/mini-app/revenue-license',
    requiredPermissions: ['revenue:read'],
    isEnabled: true,
    order: 2,
    createdAt: '2025-01-20T00:00:00Z',
    category: 'Revenue',
  },
  {
    id: 'insurance',
    name: 'Vehicle Insurance',
    description: 'Verify third-party insurance, view coverage details.',
    icon: '🛡️',
    color: '#d97706',
    entryUrl: 'http://localhost:3003',
    route: '/mini-app/insurance',
    requiredPermissions: ['insurance:read'],
    isEnabled: false,
    order: 3,
    createdAt: '2025-02-01T00:00:00Z',
    category: 'Insurance',
  },
  {
    id: 'emission',
    name: 'Emission Certificate',
    description: 'Check vehicle emission test status.',
    icon: '🌿',
    color: '#16a34a',
    entryUrl: 'http://localhost:3004',
    route: '/mini-app/emission',
    requiredPermissions: ['emission:read'],
    isEnabled: false,
    order: 4,
    createdAt: '2025-02-10T00:00:00Z',
    category: 'Environment',
  },
];

export function getAllModules(): MiniAppModule[] {
  return modulesStore;
}

export function getModuleById(id: string): MiniAppModule | undefined {
  return modulesStore.find((m) => m.id === id);
}

export function addModule(module: MiniAppModule): void {
  modulesStore.push(module);
}

export function updateModuleById(
  id: string,
  updates: Partial<MiniAppModule>
): MiniAppModule | undefined {
  const index = modulesStore.findIndex((m) => m.id === id);
  if (index === -1) return undefined;
  modulesStore[index] = { ...modulesStore[index], ...updates };
  return modulesStore[index];
}

export function removeModuleById(id: string): boolean {
  const index = modulesStore.findIndex((m) => m.id === id);
  if (index === -1) return false;
  modulesStore.splice(index, 1);
  return true;
}

export function moduleExists(id: string): boolean {
  return modulesStore.some((m) => m.id === id);
}
