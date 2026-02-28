# React + TypeScript + Vite

## Project Docs

- 实现改造记录：`IMPLEMENTATION_TRACK.md`
- 当前算法与参数：`ALGORITHM_AND_PARAMS.md`

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Simulation Commands

- `bun run sim:selftest`
- `bun run sim:autodiag`

### Selftest（并发语义门禁）

推荐三道门：

```bash
bun run sim:selftest \
  --steps 100 --trials 50 \
  --min-commit-rate 0.80 \
  --max-failure-rate 0.20 \
  --min-routes-per-step 1.8
```

```bash
bun run sim:selftest \
  --steps 200 --trials 50 --client-balance 1000000 \
  --min-commit-rate 0.84 \
  --max-failure-rate 0.16 \
  --min-routes-per-step 2.2
```

```bash
bun run sim:selftest \
  --steps 400 --trials 20 --client-balance 2000000 \
  --min-commit-rate 0.86 \
  --max-failure-rate 0.15 \
  --min-routes-per-step 2.4
```

### AutoDiag（Judge 主路径）

`sim:autodiag` 必须提供 `--judge-cmd`。脚本会把诊断 JSON 通过 stdin 传给 judge，读取 stdout verdict。

示例（Codex Judge）：

```bash
bun run sim:autodiag \
  --steps 200 \
  --trials 50 \
  --mode ui \
  --judge-cmd 'bun run src/scripts/codex-judge.ts --model gpt-5.3-codex --timeout-ms 180000' \
  --whitepaper-path ../whitepaper.md \
  --json-out reports/autodiag-codex.json
```

默认阻断条件：

- 结构性失败：`invalid_state` / `no_route` / `inflight_not_drained` / `all_isolated`
- Judge 失败：`verdict=fail`
- Judge 基础设施失败：judge 命令执行错误

Verdict JSON：

```json
{
  "verdict": "pass | fail",
  "reason": "short explanation",
  "confidence": 0.0,
  "findings": ["optional"],
  "suggestedActions": ["optional"]
}
```
