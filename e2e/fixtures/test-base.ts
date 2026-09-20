import { test as base, expect } from '@playwright/test';
import { setupMockApi, MockOverrides } from '../mocks/mock-handlers';
import { loginAsClient, loginAsProvider, loginAsAdmin, clearAuth } from './auth-states';

type CustomFixtures = {
  mockApi: (overrides?: MockOverrides) => Promise<void>;
};

export const test = base.extend<CustomFixtures>({
  mockApi: [
    async ({ page }, use) => {
      // Automatically set up default mock API handlers for every test
      await setupMockApi(page);

      // Provide helper function if a test needs dynamic overrides
      await use(async (overrides?: MockOverrides) => {
        await setupMockApi(page, overrides);
      });
    },
    { auto: true },
  ],
});


export { expect, loginAsClient, loginAsProvider, loginAsAdmin, clearAuth };
