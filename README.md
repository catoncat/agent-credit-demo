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

- `bun run sim:status`
- `bun run sim:stress-grid`
- `bun run sim:gate1`
- `bun run sim:gate2`
- `bun run sim:gate3`
- `bun run sim:gates`

### 推荐流程（先跑数据再分析）

`sim:status`：单场景现状诊断（不阻断，输出 JSON/Markdown 报告）。  
`sim:stress-grid`：压力场景网格诊断（默认不依赖 Judge）。

```bash
bun run sim:status
bun run sim:stress-grid
```

### Gate 设计（给循环器用）

- Gate1：并发语义硬门（短程）
- Gate2：异常诊断硬门（中程）
- Gate3：异常诊断硬门（长程）
- `sim:gates` 按顺序执行 1 -> 2 -> 3，任一失败即中断。

```bash
bun run sim:gates
```

### Selftest（Gate1）

默认零容忍（`max-failed-trial-ratio=0`），不再放过尾部失败。

```bash
bun run sim:gate1
```

### AutoDiag（Gate2/3）

`sim:autodiag` 现在默认不强制 Judge。  
阻断依据优先使用结构/异常统计（`failedTrials` + `anomalyTrials`）。

```bash
bun run sim:gate2
bun run sim:gate3
```

默认阻断条件：

- 结构失败与异常失败：来自 `failedTrials` + `anomalyTrials`
- Gate 流程不依赖 Judge 结论

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
