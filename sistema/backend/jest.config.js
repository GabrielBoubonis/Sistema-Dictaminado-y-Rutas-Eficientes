module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testTimeout: 30000,
  globalSetup: '<rootDir>/test/global-setup.js',
  // Con moduleResolution node16, Prisma genera imports relativos con '.js' que en los tests apuntan a los '.ts'.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', esModuleInterop: true, strict: true, skipLibCheck: true, resolveJsonModule: true, target: 'ES2022' }, diagnostics: false }] },
};
