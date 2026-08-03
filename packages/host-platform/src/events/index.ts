export type {
  PlatformEvent,
  EventSchema,
  EventRegistryEntry,
} from './platform-event';
export { PLATFORM_EVENTS, createPlatformEvent } from './platform-event';
export {
  EventBus,
  createEventBus,
  type EventHandler,
  type EventMiddleware,
  type EventBusMetrics,
  type EventBusOptions,
} from './event-bus';
