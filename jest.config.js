const [nodeModulesPattern, ...otherPatterns] = require('jest-expo/jest-preset').transformIgnorePatterns;

module.exports = {
    preset: 'jest-expo',
    testMatch: ['**/src/**/*.test.ts'],
    transformIgnorePatterns: [
        // Marked ships as ESM, so Jest's CommonJS runtime needs the Babel transform.
        nodeModulesPattern.replace('/node_modules/', '/node_modules/(?!marked/)'),
        ...otherPatterns,
    ],
};
