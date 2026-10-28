# 演示素材 / README media

README 使用本项目的实际界面输出，没有使用第三方产品照片来冒充软件效果。

| 文件 | 展示内容 | 来源 |
| --- | --- | --- |
| `brand.svg` | Pocket Shelf 标识与纸色横幅 | 本项目原创 SVG |
| `pocket-shelf-demo.gif` | 左右选卡 → 机背插卡 → 居中开机 → 回到卡带架 | 真实原生 C/OpenGL 渲染器逐帧导出；Mac 调试环境 |
| `native-shelf.png` | 三张示例卡带的浏览界面 | 同一次原生渲染 |
| `native-boot.png` | 居中的掌机与开机字样 | 同一次原生渲染 |
| `native-insertion.png` | 掌机背面与短 GBA 卡带 | 同一次原生渲染 |
| `boot-preview.png`、`gba-preview.png`、`swipe-preview.png` | 先前的网页原型截图 | 本项目的 Three.js 交互预览 |
| `native-preview.png` | 先前的原生浏览界面截图 | 本项目 Mac 原生调试版 |

本次新素材于 **2026-10-28** 从 `214b44d` 版本的原生渲染器生成。GIF 为 960 × 540、15 fps、约 13 秒、无声循环；PNG 为 1280 × 720。GIF 编码以百分之一秒量化每帧时长。动画使用不透明帧和矩形偏移压缩，避免透明差分帧在深色背景下露底。

这些画面**不是 Switch 实机录像**。卡带使用与网页示例相同的公开游戏名称、容量元数据及本项目自绘标签，不会打开 ROM；开机完成后直接展示返回动画，游戏运行段未展示。录制脚本通过原生状态机调用产生动画，没有另做一套宣传专用动画。

## 重新生成

需要图形桌面环境、C 编译器、Python 3、SDL2、FreeType、libpng、pkg-config 和 FFmpeg。macOS 可安装：

```sh
brew install sdl2 freetype libpng pkg-config ffmpeg
```

在仓库根目录运行：

```sh
python3 contrib/pocket-shelf/tools/render-readme-demo.py
```

脚本会在已忽略的 `build-readme-media/` 下编译独立录制工具，创建隐藏的 OpenGL 窗口，调用 `src/platform/pocket-shelf/` 中的实际渲染器与动画状态机，然后更新上表中的 GIF 与三张 PNG。不读取游戏库、不运行模拟核心，也不需要任何 ROM。修改原生界面后可用同一命令更新展示素材。

## 归属

录制工具、原创界面与标签、品牌 SVG 采用本分支的 MPL-2.0。示例游戏名称用于识别卡带；Game Boy/Nintendo 字标保留其来源与商标归属，字体和依赖保留各自许可证。原机开场参考录像、字标来源及字体许可统一见 [NOTICE](../NOTICE.md)；掌机与卡带造型参考见 [HARDWARE_REFERENCES](../HARDWARE_REFERENCES.md)。
