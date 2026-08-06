import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

import baseConfig from '../eslint.config.mjs';

/**
 * Next.js app config — layers the official `eslint-config-next`
 * `core-web-vitals` + `typescript` presets (native flat configs) on top of the
 * repo-global base. The base ends with `eslint-config-prettier`, so formatting
 * conflicts always resolve in prettier's favor.
 */

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  ...baseConfig,
]
export default config;
