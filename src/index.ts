/**
 * MediaTestModule — Module Entry Point (MFE Bundle)
 *
 * Barrel export for: definition, schema, and all React components.
 * This file is the Vite library entry point.
 */

export { media_testDefinition } from '../definition';
export { media_testTable } from '../schema';
export { MediaTestTable } from './components/MediaTestTable';
export { MediaTestDetailPanel } from './components/MediaTestDetailPanel';
export { MediaTestDashboardWidget } from './components/MediaTestDashboardWidget';
