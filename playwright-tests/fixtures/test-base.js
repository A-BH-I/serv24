import { test as base, expect } from '@playwright/test';
import { setupMockApi } from '../mocks/mock-handlers.js';
import { loginAsClient, loginAsProvider, loginAsAdmin, clearAuth } from './auth-helpers.js';

const useMocks = process.env.USE_MOCKS !== 'false';

export const test = base.extend({
  mockApi: [
    async ({ page }, use) => {
      if (useMocks) {
        // Automatically attach route interceptors in mock mode
        await setupMockApi(page);
      }

      // Provide helper function if a test needs dynamic overrides
      await use(async (overrides = {}) => {
        if (useMocks) {
          await setupMockApi(page, overrides);
        }
      });
    },
    { auto: true },
  ],
});

export { expect, loginAsClient, loginAsProvider, loginAsAdmin, clearAuth, useMocks };
