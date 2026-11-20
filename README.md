# Color Picker

> Cross-platform screen color picker with format conversion, contrast checking, and AI color tools.

`org.asyar.color-picker` is a Tier 2 Asyar extension (design-tools · macOS, Windows, Linux).

## What it does

The extension provides **3 commands**:

| Command | Mode | What it does |
| --- | --- | --- |
| **Pick Color** | `view` | Sample any pixel on screen and copy it in your default format |
| **Color History** | `view` | Browse, search, favorite, and copy previously picked colors |
| **Convert Color** | `view` | Convert a color between formats, check contrast, and get AI suggestions |

## Permissions

```json
"permissions": [
  "screen:pick-color",
  "clipboard:write",
  "storage:read",
  "storage:write",
  "preferences:read",
  "notifications:send",
  "extension:invoke",
  "shell:open-url"
]
```

## Install

Install from the [Asyar Store](https://asyar.org/extensions).

## Develop

```bash
# from this directory
pnpm install
pnpm dev          # vite dev server
pnpm test:run     # vitest
pnpm build        # emits dist/{worker,view}.js + assets
pnpm link         # registers the dev path with the launcher
asyar publish     # builds, packages, GitHub release, store submission
```

## License

[MIT](./LICENSE) © Khoshbin
