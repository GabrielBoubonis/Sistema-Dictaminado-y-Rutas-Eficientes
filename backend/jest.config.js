module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testTimeout: 30000,
  globalSetup: '<rootDir>/test/global-setup.js',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', esModuleInterop: true, strict: true, skipLibCheck: true, resolveJsonModule: true, target: 'ES2022' }, diagnostics: false }] },
};
