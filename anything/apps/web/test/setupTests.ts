import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { resetVisitorLang } from '../src/lib/publicPet/langStore';

// The ES / EN choice is shared state: no test inherits another's.
afterEach(() => resetVisitorLang());