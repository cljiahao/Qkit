import next from "eslint-config-next";

const eslintConfig = [
  ...next,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "supabase/**",
      "coverage/**",
      ".stryker-tmp/**",
      "reports/**",
    ],
  },
];

export default eslintConfig;
