import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with testing-library matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.scrollTo
vi.mock('window.scrollTo', () => ({
  scrollTo: vi.fn(),
}));

// Mock URLSearchParams
global.URLSearchParams = class URLSearchParams {
  private params: Record<string, string> = {};
  
  constructor(init?: string) {
    if (init) {
      const searchParams = new URLSearchParams(init);
      searchParams.forEach((value, key) => {
        this.params[key] = value;
      });
    }
  }
  
  get(key: string): string | null {
    return this.params[key] || null;
  }
  
  set(key: string, value: string): void {
    this.params[key] = value;
  }
  
  delete(key: string): void {
    delete this.params[key];
  }
  
  has(key: string): boolean {
    return key in this.params;
  }
  
  forEach(callback: (value: string, key: string) => void): void {
    Object.entries(this.params).forEach(([key, value]) => callback(value, key));
  }
  
  entries(): IterableIterator<[string, string]> {
    return Object.entries(this.params)[Symbol.iterator]();
  }
  
  toString(): string {
    return new URLSearchParams(this.params).toString();
  }
};
