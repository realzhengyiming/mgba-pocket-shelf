# Pocket Shelf / 口袋卡带架

A cartridge-style frontend experiment for mGBA, aimed at Nintendo Switch.

让选游戏像挑一张实体卡带：浏览收藏 → 拿起 → 插入掌机 → 开机 → 交给 mGBA。

## What works today / 当前可用

- Interactive Three.js browser prototype, including drag-and-drop, insertion, boot and eject.
- Local ROM-folder catalogue and same-name PNG/JPEG covers, with custom cartridge-label fallback.
- Keyboard controls, optional sound, shell colors and reduced motion.
- GLB model and motion-parameter exports for a later native renderer.
- CMake presets for a native macOS SDL/OpenGL debugging baseline and Switch cross-compilation.

**The browser prototype does not launch mGBA. The new cartridge UI has not been ported to or tested on Switch yet.**

网页原型不会启动游戏。目前原生构建运行的仍是 mGBA 本来的 SDL 界面；新的 3D 卡带界面尚未接入原生前端。自动联网匹配封面也尚未实现。

## Preview / 预览

```sh
cd contrib/pocket-shelf/preview
npm ci
npm run dev
```

Open <http://127.0.0.1:3764>. With no game files present, clearly marked design-only sample cards are shown. No ROMs are bundled.

默认扫描 `contrib/pocket-shelf/roms`，也可以指定自己的目录：

```sh
POCKET_ROMS=/absolute/path/to/roms npm run dev
```

For a genuinely empty shelf instead of sample cards, set `POCKET_DEMO=0`.

- Left/right: choose a cartridge.
- Enter / A: insert. Esc / B: cancel or eject. X: rescan.
- A selected cartridge can also be dragged onto the handheld.
- Same-name covers can live next to the ROM, in its `covers` subfolder, or in `assets/covers`.
- The workbench beneath the preview exports `.glb` models and motion JSON.

The local server listens on loopback only. Its catalogue omits absolute filesystem paths and does not serve ROM bytes.

## Native development / 原生调试

Requirements on macOS: Xcode command-line tools, CMake 3.21+, SDL2 and pkg-config. For a supported Homebrew installation:

```sh
brew install cmake sdl2 pkg-config
cmake --preset pocket-macos-debug
cmake --build --preset pocket-macos-debug --parallel 4
./build-pocket-macos/sdl/mgba /absolute/path/to/game.gba
```

Run these commands from the repository root. The exact SDL executable path is `build-pocket-macos/sdl/mgba`.

This builds mGBA itself as a native Mac app, with debug symbols and a compilation database. It is a baseline for later frontend work, not the new 3D UI. VS Code/LLDB can attach to this executable.

To check that desktop OpenGL really creates a context, compiles shaders and draws pixels on your machine:

```sh
cc contrib/pocket-shelf/tools/probe-opengl.c $(pkg-config --cflags --libs sdl2) -framework OpenGL -o build-pocket-macos/pocket-gl-probe
./build-pocket-macos/pocket-gl-probe
```

Mac 上先调界面、资源加载、动画与输入逻辑；开发虚拟机只负责准备工具和交叉编译，不是在模拟一台 Switch。掌机按键、SD 路径、NRO 切换、睡眠恢复与性能必须在 Switch 上验收。

With a devkitPro Switch environment installed:

```sh
cmake --preset pocket-switch
cmake --build --preset pocket-switch --parallel 4
```

The Switch preset is prepared for later cross-build verification. See [ARCHITECTURE.md](ARCHITECTURE.md) for the proposed native integration.

## Checks

```sh
cd contrib/pocket-shelf/preview
npm test
```

The tests cover catalogue scanning, filename preservation, duplicate identities, deterministic insertion timing, reduced motion, and the preview server's file-serving boundary.

## License and upstream

The original mGBA license and attribution are retained. New Pocket Shelf source in this fork is MPL-2.0; third-party assets retain their own licenses, listed in [NOTICE.md](NOTICE.md).

This fork includes AI-assisted development. Upstream's contribution policy does not accept AI-generated pull requests; these changes are maintained in this fork and are not being submitted upstream.
