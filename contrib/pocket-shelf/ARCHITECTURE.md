# Native frontend plan

## Shared layer

Keep the game catalogue, cover lookup, selected game, animation state machine, model data and shader logic platform-independent. Use C/C++ and an OpenGL 3.x / OpenGL ES 3 compatible renderer for the native implementation.

The Three.js prototype is the interaction reference. Export model/texture data as GLB and deterministic poses/timings as JSON. Three.js, HTML and DOM event handlers are not directly runnable inside mGBA's native frontend.

## macOS adapter

- SDL creates the native window and OpenGL context.
- Mouse, keyboard and game controllers feed shared input actions.
- Local folders supply game files and cover images.
- LLDB, debug symbols and `compile_commands.json` support normal native debugging.
- A first integration can launch the desktop mGBA executable. A later in-process integration can use libmGBA; saves and pause/resume behavior must be tested before switching to it.

## Switch adapter

- Reuse mGBA's existing libnx, EGL and OpenGL ES initialization and input code.
- Scan `sdmc:/roms` and use cached local cover images first.
- After insertion, initially use `envSetNextLoad` with the mGBA NRO path and the quoted ROM path. The current Switch `main.c` supports `argv[1]` as the game path.
- Preserve existing ROM locations and mGBA save configuration.
- Keep hardware-specific initialization and shutdown outside the shared renderer.

An in-process frontend inside mGBA would give better return-to-shelf behavior, but needs explicit lifecycle and renderer-state integration. NRO handoff is a practical first step, not a substitute for that work.

## Verification boundaries

| Environment | What it can verify |
| --- | --- |
| Browser prototype | Interaction, visual direction, model layout and animation timing |
| Native Mac build | C/C++ integration, actual graphics code, loading, input logic and memory handling |
| Build VM / container | Reproducible toolchain and creation of a Switch NRO |
| Physical Switch | Frame time, handheld/docked display, Joy-Con mapping, SD access, NRO handoff and suspend/resume |

GBA emulation does not virtualize Switch system APIs. Successful Mac tests or cross-compilation do not prove that a Switch build runs correctly.

## Next implementation milestones

1. Confirm the visual design in the browser prototype.
2. Load the same exported scene in a native desktop renderer and exercise insertion/cancel/eject.
3. Add the Switch platform adapter and produce an NRO.
4. Verify launching the existing mGBA NRO and save continuity on actual hardware.
5. Profile and simplify lighting/materials for Switch 1; cache covers and virtualize large libraries.
