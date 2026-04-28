import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// Mock window.scrollTo
vi.stubGlobal('scrollTo', vi.fn());

// Mock URLSearchParams
// @ts-expect-error Mock class does not fully implement URLSearchParams
globalThis.URLSearchParams = class URLSearchParams {
  private params: Record<string, string> = {};
  
  constructor(init?: string) {
    if (init) {
      const searchParams = new URLSearchParams(init);
      searchParams.forEach((value, key) => {
        this.params[key] = value;
      });
    }
  }
  
  get size(): number {
    return Object.keys(this.params).length;
  }
  
  get(key: string): string | null {
    return this.params[key] || null;
  }
  
  getAll(key: string): string[] {
    return this.params[key] ? [this.params[key]] : [];
  }
  
  set(key: string, value: string): void {
    this.params[key] = value;
  }
  
  append(key: string, value: string): void {
    this.params[key] = value;
  }
  
  delete(key: string): void {
    delete this.params[key];
  }
  
  has(key: string): boolean {
    return key in this.params;
  }
  
  sort(): void {}
  
  forEach(callback: (value: string, key: string) => void): void {
    Object.entries(this.params).forEach(([key, value]) => callback(value, key));
  }
  
  keys(): IterableIterator<string> {
    return Object.keys(this.params)[Symbol.iterator]();
  }
  
  values(): IterableIterator<string> {
    return Object.values(this.params)[Symbol.iterator]();
  }
  
  entries(): IterableIterator<[string, string]> {
    return Object.entries(this.params)[Symbol.iterator]();
  }
  
  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries();
  }
  
  toString(): string {
    return Object.entries(this.params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
  }
};
