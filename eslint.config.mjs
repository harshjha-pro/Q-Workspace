import next from "eslint-config-next";

export default [
  ...next,
  { ignores: ["generated/**", ".next/**", "storage/**", "backups/**", "playwright-report/**", "coverage/**"] },
];
