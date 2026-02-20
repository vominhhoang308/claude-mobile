// Monorepo shim: node_modules/expo/AppEntry.js resolves '../../App' to this file.
// We forward to the actual app entry in apps/mobile/.
export { default } from './apps/mobile/App';
