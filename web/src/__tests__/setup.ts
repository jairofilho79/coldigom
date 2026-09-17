import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// Mock window.scrollTo
vi.stubGlobal('scrollTo', vi.fn());

// Node ≥ 22 expõe um `localStorage` global experimental que, sem
// --localstorage-file, é um stub sem getItem/setItem. Como a chave já existe no
// global, o vitest não copia a do jsdom por cima (populateGlobal só sobrescreve
// chaves conhecidas). Um Storage de memória repõe o que o navegador tem.
class StorageDeMemoria implements Storage {
  private dados = new Map<string, string>();
  get length() {
    return this.dados.size;
  }
  key(indice: number) {
    return [...this.dados.keys()][indice] ?? null;
  }
  getItem(chave: string) {
    return this.dados.get(chave) ?? null;
  }
  setItem(chave: string, valor: string) {
    this.dados.set(chave, String(valor));
  }
  removeItem(chave: string) {
    this.dados.delete(chave);
  }
  clear() {
    this.dados.clear();
  }
}
if (typeof globalThis.localStorage?.getItem !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new StorageDeMemoria(),
  });
}
