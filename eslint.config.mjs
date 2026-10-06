import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: ["generated/**", ".next/**", "storage/**", "backups/**", "playwright-report/**", "coverage/**"] },
];
export default config;
