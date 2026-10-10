// Minimal lint, aimed at one class of bug: a const read above the line that
// declares it. That throws "Cannot access 'x' before initialization" at render
// time, which minifies into an unreadable name and takes the whole app down —
// it put every tablet on a white screen on 10 Oct. Run it before a release:
//   npx eslint src
module.exports = {
  root: true,
  parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } },
  env: { browser: true, es2022: true },
  rules: { "no-use-before-define": ["error", { functions: false, classes: false, variables: true }] },
};
