import { mockUsers } from '../mocks/mock-data.js';

export async function loginAsClient(page) {
  await page.addInitScript((user) => {
    window.localStorage.setItem('auth_token', 'mock-client-jwt-token');
    window.localStorage.setItem('user', JSON.stringify(user));
  }, mockUsers.client);
}

export async function loginAsProvider(page) {
  await page.addInitScript((user) => {
    window.localStorage.setItem('auth_token', 'mock-provider-jwt-token');
    window.localStorage.setItem('user', JSON.stringify(user));
  }, mockUsers.provider);
}

export async function loginAsAdmin(page) {
  await page.addInitScript((user) => {
    window.localStorage.setItem('auth_token', 'mock-admin-jwt-token');
    window.localStorage.setItem('user', JSON.stringify(user));
  }, mockUsers.admin);
}

export async function clearAuth(page) {
  await page.addInitScript(() => {
    window.localStorage.removeItem('auth_token');
    window.localStorage.removeItem('user');
  });
}
