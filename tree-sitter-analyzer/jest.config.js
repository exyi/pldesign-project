/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest',
  rootDir: '',
  testPathIgnorePatterns: [ "dist/.*" ],
  testEnvironment: 'node',
  // transform: {},
  // extensionsToTreatAsEsm: [".ts"],
  // moduleNameMapper: {
  //   '^(\\.{1,2}/.*)\\.js$': '$1',
  // },
  globals: {
    "ts-jest": {
      // useESM: true,
      tsconfig: "tsconfig.jest.json",
      tsConfig: "tsconfig.jest.json"
    }
  }
};
