import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: [".next/**", "node_modules/**", "supabase/**", "scripts/**"] },
  {
    rules: {
      "react/no-danger": "error",
    },
  },
];

export default config;
