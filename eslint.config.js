/*
  Configuración de ESLint (formato plano, el que usa ESLint 9 en adelante).

  Reglas del plan que se aplican aquí (sección 4, "Herramientas de calidad"):
    · ESLint para todo el repositorio.
    · TypeScript en modo estricto y sin `any` en el cliente.
    · El código del prototipo no se revisa: es material de consulta congelado.
*/

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/*.tsbuildinfo",
    ],
  },

  js.configs.recommended,

  /*
    --- Servidor: JavaScript moderno sobre Node -------------------------------
    El backend se queda en JavaScript (así lo define la estructura del plan).
    Lo que se le exige es código limpio, sin variables sin usar ni comparaciones
    sospechosas.
  */
  {
    files: ["servidor/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["error", "warn", "info"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },

  /*
    --- Herramientas de línea de comandos -------------------------------------
    crear-base, migrar y semilla son programas que se ejecutan a mano y cuyo
    trabajo es justamente escribir en la terminal. Ahí console.log no es un
    descuido: es la salida del programa.
  */
  {
    files: ["servidor/herramientas/**/*.js", "cargar-demo.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-console": "off",
    },
  },

  /*
    --- Cliente: TypeScript estricto con comprobación de tipos ---------------
    `recommendedTypeChecked` levanta las reglas que necesitan conocer los tipos
    reales del código (promesas sin esperar, valores posiblemente nulos, etc.).
  */
  {
    files: ["cliente/**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommendedTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // El plan lo pide explícitamente: sin `any` (sección 4).
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // Las funciones del cliente que hablan con la API deben esperarse.
      "@typescript-eslint/no-floating-promises": "error",
      "no-console": ["warn", { allow: ["error", "warn", "info"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },

  /*
    --- Archivos de configuración sueltos ------------------------------------
  */
  {
    files: ["**/*.config.{js,ts}", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
);
