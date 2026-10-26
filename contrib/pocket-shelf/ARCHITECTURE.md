# Native frontend integration

The browser is the design reference. The shipped Switch frontend is C and OpenGL ES 3, inside mGBA's existing libnx/EGL app; it does not embed Three.js or a browser.

## Shared native layer

- `src/platform/pocket-shelf/pocket-shelf.c`: bounded recursive catalogue, local cover lookup, original filenames, selection, a shared axis-locked swipe/tap recognizer with bounded inertia, and deterministic rear-insertion/cancellation/ejection poses.
- `renderer.c`: OpenGL 3.2 / OpenGL ES 3 shaders, indexed model batches, a 1280 × 720 offscreen framebuffer, a bounded five-cover cache and FreeType CJK text atlas. Large user covers are limited before GPU upload.
- `contrib/pocket-shelf/assets/native`: checked-in geometry baked from our own GLB export, plus our original illustrative labels. The baker merges material batches and deduplicates vertices. It does not run on the Switch.

Regenerate geometry with `tools/bake-model.py` using an export of the browser's three default design-sample cards, in default purple. The baker's optional sample label extraction assumes the Anguna/Apotris/Celeste reference set. No ROMs are needed to export the design samples. The browser remains independently usable for design iterations; changing it does not automatically change native code.

## Switch adapter and game lifecycle

`src/platform/switch/pocket-shelf.inc` adapts Joy-Con, stick, single-finger shelf swipes/taps, application lifetime and docked/handheld output. It returns the exact selected path through an optional `mGUIRunner.selectGame` hook. `mGUIRunloop` then applies the same recent-game/config updates and calls the original `mGUIRun`.

All shelf GPU resources, font state and catalogue allocations are released **before** starting the game. The emulator retains its own renderer, audio, input, pause, save and autosave code. Exiting the game returns to the picker and reconstructs the shelf, with the last cartridge's ejection animation. A shader/asset initialization failure, or pressing Minus, opens the original file picker.

The shelf renders into its own depth-equipped framebuffer, then blits into the existing Switch surface/crop. It does not require changing the emulator's EGL configuration or resolution policy. Its teardown restores the GL state expected by the existing GUI. The NRO has a separate title and file association, so it can coexist with the original mGBA entry.

## macOS adapter

SDL2 creates an OpenGL 3.2 context and feeds the same C state machine and renderer. It launches the existing SDL emulator via an argument array (no shell), waits for that process to close, rebuilds graphics resources and ejects the cartridge. This is a development adapter; the Switch uses the in-process GUI hook, not a subprocess or NRO chain load.

The smoke mode renders insertion/return, runs a supplied ROM for 240 emulated frames through libmGBA and recreates the renderer. A separate UI test on Mac verified selecting a cartridge, inspecting the rear, launching Celeste Classic through SDL and returning to the shelf.

## Build and verification boundaries

The `pocket-switch` preset enables `BUILD_POCKET_SHELF`. The pinned official devkitPro image builds the NRO, embedding models, labels, the CJK font and its license in RomFS. `tools/package-switch.py` validates NRO identity, asset bounds, the actual RomFS table and the embedded model against the current source before staging the SD layout and SHA256.

CI checks the browser prototype, Linux native build/state tests and Switch NRO/package creation. Local tests additionally cover AddressSanitizer/UndefinedBehaviorSanitizer and Mac GPU rendering. No ROMs or private filesystem paths are committed.

A successful host run and cross-build do not validate Switch hardware. Joy-Con mapping, sleep/HOME recovery, dock switching, save continuity and frame time remain on-device acceptance checks. See [SWITCH_TEST.md](SWITCH_TEST.md).
