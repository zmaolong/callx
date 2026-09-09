global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom doesn't provide these on `window` the way browsers do.
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  }))
});

jest.mock('nanoid', () => {
  return {
    nanoid: () => {},
    customAlphabet: () => () => 'test_nano_id_1234567890abcdef'
  };
});

jest.mock('strip-json-comments', () => {
  return {
    stripJsonComments: (str) => str
  };
});
