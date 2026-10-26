/* SPDX-License-Identifier: MPL-2.0 */
#define _POSIX_C_SOURCE 200809L
#include "renderer.h"
#include <SDL.h>
#include <mgba-util/image.h>
#include <mgba/core/config.h>
#include <mgba/core/core.h>
#ifdef __APPLE__
#define GL_SILENCE_DEPRECATION
#include <OpenGL/gl3.h>
#else
#define GL_GLEXT_PROTOTYPES
#include <SDL_opengl.h>
#endif
#include <errno.h>
#include <math.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
extern char** environ;

static unsigned key(SDL_Keycode k) {
	switch (k) {
	case SDLK_LEFT:
		return PS_LEFT;
	case SDLK_RIGHT:
		return PS_RIGHT;
	case SDLK_RETURN:
	case SDLK_a:
		return PS_ACCEPT;
	case SDLK_ESCAPE:
	case SDLK_b:
		return PS_BACK;
	case SDLK_x:
		return PS_RESCAN;
	case SDLK_y:
		return PS_INSPECT;
	case SDLK_MINUS:
		return PS_CLASSIC;
	case SDLK_q:
		return PS_EXIT;
	case SDLK_r:
		return PS_REDUCE;
	default:
		return 0;
	}
}
static bool runCore(const char* path) {
	struct mCore* core = mCoreFind(path);
	if (!core)
		return false;
	if (!core->init(core)) {
		core->deinit(core);
		return false;
	}
	mCoreConfigInit(&core->config, "pocket-smoke");
	mCoreConfigSetOverrideIntValue(&core->config, "logLevel", 7);
	mCoreConfigSetOverrideIntValue(&core->config, "threadedVideo", 0);
	mCoreLoadConfig(core);
	mColor* pixels = calloc(256 * 256, sizeof(mColor));
	if (!pixels) {
		mCoreConfigDeinit(&core->config);
		core->deinit(core);
		return false;
	}
	core->setVideoBuffer(core, pixels, 256);
	bool ok = mCoreLoadFile(core, path);
	if (ok) {
		core->reset(core);
		for (unsigned i = 0; i < 240; ++i)
			core->runFrame(core);
		core->unloadROM(core);
	}
	mCoreConfigDeinit(&core->config);
	core->deinit(core);
	free(pixels);
	return ok;
}
static bool launch(SDL_Window* window, const char* exe, const char* path) {
	char* args[] = { (char*) exe, (char*) path, NULL };
	pid_t child;
	int rc = posix_spawn(&child, exe, NULL, NULL, args, environ);
	if (rc) {
		fprintf(stderr, "Could not start mGBA: %s\n", strerror(rc));
		return false;
	}
	SDL_HideWindow(window);
	int status = 0;
	while (waitpid(child, &status, WNOHANG) == 0) {
		SDL_Event event;
		while (SDL_PollEvent(&event)) {
		}
		SDL_Delay(20);
	}
	SDL_ShowWindow(window);
	SDL_RaiseWindow(window);
	return WIFEXITED(status) && WEXITSTATUS(status) == 0;
}
struct DesktopPointer {
	bool active;
	SDL_FingerID id;
	float x, y, startX, startY;
};
static void beginPointer(struct DesktopPointer* p, struct PSState* s, SDL_FingerID id, float x, float y, double now) {
	if (p->active || s->mode != PS_BROWSE)
		return;
	*p = (struct DesktopPointer) { true, id, x, y, x, y };
	if (x < 690 && y > 230 && y < 520)
		PSGestureBegin(s, x, y, 136, now);
}
static void movePointer(struct DesktopPointer* p, struct PSState* s, size_t count, SDL_FingerID id, float x, float y,
                        double now) {
	if (!p->active || p->id != id)
		return;
	p->x = x;
	p->y = y;
	PSGestureMove(s, count, x, y, now);
}
static unsigned endPointer(struct DesktopPointer* p, struct PSState* s, size_t count, SDL_FingerID id, float x, float y,
                           double now, bool cancel) {
	if (!p->active || p->id != id)
		return 0;
	bool hadGesture = s->gesture.active;
	enum PSGestureResult result = PSGestureEnd(s, count, x, y, now, cancel);
	p->active = false;
	bool tap = hadGesture ? result == PS_GESTURE_TAP : hypotf(x - p->startX, y - p->startY) < 10;
	if (cancel || !tap || s->mode != PS_BROWSE)
		return 0;
	return PSShelfTapAction(s, count, x, y);
}
int main(int argc, char** argv) {
	const char* root = PS_DEFAULT_ROMS;
	const char* assets = PS_ASSET_DIR;
	const char* font = PS_FONT_PATH;
	const char* exe = PS_EMULATOR_PATH;
	const char* smoke = NULL;
	const char* shots = NULL;
	for (int i = 1; i < argc; ++i) {
		if (i + 1 < argc && !strcmp(argv[i], "--roms"))
			root = argv[++i];
		else if (i + 1 < argc && !strcmp(argv[i], "--assets"))
			assets = argv[++i];
		else if (i + 1 < argc && !strcmp(argv[i], "--font"))
			font = argv[++i];
		else if (i + 1 < argc && !strcmp(argv[i], "--emulator"))
			exe = argv[++i];
		else if (i + 1 < argc && !strcmp(argv[i], "--self-test-rom"))
			smoke = argv[++i];
		else if (i + 1 < argc && !strcmp(argv[i], "--screenshots"))
			shots = argv[++i];
		else {
			fprintf(stderr, "Usage: %s [--roms DIR] [--self-test-rom FILE] [--screenshots DIR]\n", argv[0]);
			return 2;
		}
	}
	if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_GAMECONTROLLER)) {
		fprintf(stderr, "%s\n", SDL_GetError());
		return 1;
	}
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 2);
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_CORE);
	SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
	SDL_Window* window =
	    SDL_CreateWindow("mGBA Pocket Shelf · Native", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, 1280, 720,
		                 SDL_WINDOW_OPENGL | SDL_WINDOW_RESIZABLE | SDL_WINDOW_ALLOW_HIGHDPI);
	SDL_GLContext context = window ? SDL_GL_CreateContext(window) : NULL;
	if (!context) {
		fprintf(stderr, "%s\n", SDL_GetError());
		if (window)
			SDL_DestroyWindow(window);
		SDL_Quit();
		return 1;
	}
	SDL_GL_SetSwapInterval(smoke ? 0 : 1);
	struct PSCatalog catalog = { 0 };
	PSCatalogScan(&catalog, root);
	struct PSState state;
	PSStateInit(&state, smoke ? PSCatalogFind(&catalog, smoke) : catalog.count > 1 ? 1 : 0);
	char error[512] = { 0 }, notice[512] = { 0 };
	struct PSRenderer* renderer = PSRendererCreate(assets, font, error, sizeof(error));
	if (!renderer) {
		fprintf(stderr, "%s\n", error);
		SDL_GL_DeleteContext(context);
		SDL_DestroyWindow(window);
		PSCatalogClear(&catalog);
		SDL_Quit();
		return 1;
	}
	SDL_GameController* pad = NULL;
	for (int i = 0; i < SDL_NumJoysticks(); ++i)
		if (SDL_IsGameController(i)) {
			pad = SDL_GameControllerOpen(i);
			if (pad)
				break;
		}
	struct DesktopPointer pointer = { 0 };
	bool running = true;
	int result = 0;
	unsigned frame = 0;
	double origin = SDL_GetPerformanceCounter() / (double) SDL_GetPerformanceFrequency();
	if (smoke && (!catalog.count || strcmp(catalog.games[state.selected].path, smoke))) {
		fprintf(stderr, "Smoke ROM must be inside --roms and use its exact path\n");
		result = 1;
		running = false;
	}
	while (running) {
		unsigned actions = 0;
		double inputNow = SDL_GetPerformanceCounter() / (double) SDL_GetPerformanceFrequency() - origin;
		int windowWidth, windowHeight;
		SDL_GetWindowSize(window, &windowWidth, &windowHeight);
		float scaleX = 1280.f / (windowWidth ? windowWidth : 1), scaleY = 720.f / (windowHeight ? windowHeight : 1);
		SDL_Event e;
		while (SDL_PollEvent(&e)) {
			if (e.type == SDL_QUIT)
				running = false;
			if (e.type == SDL_KEYDOWN)
				actions |= key(e.key.keysym.sym);
			if (e.type == SDL_CONTROLLERBUTTONDOWN) {
				switch (e.cbutton.button) {
				case SDL_CONTROLLER_BUTTON_DPAD_LEFT:
					actions |= PS_LEFT;
					break;
				case SDL_CONTROLLER_BUTTON_DPAD_RIGHT:
					actions |= PS_RIGHT;
					break;
				case SDL_CONTROLLER_BUTTON_A:
					actions |= PS_ACCEPT;
					break;
				case SDL_CONTROLLER_BUTTON_B:
					actions |= PS_BACK;
					break;
				case SDL_CONTROLLER_BUTTON_X:
					actions |= PS_RESCAN;
					break;
				case SDL_CONTROLLER_BUTTON_Y:
					actions |= PS_INSPECT;
					break;
				case SDL_CONTROLLER_BUTTON_START:
					actions |= PS_EXIT;
					break;
				default:
					break;
				}
			}
			if (e.type == SDL_MOUSEBUTTONDOWN && e.button.button == SDL_BUTTON_LEFT &&
			    e.button.which != SDL_TOUCH_MOUSEID)
				beginPointer(&pointer, &state, INT64_MIN, e.button.x * scaleX, e.button.y * scaleY, inputNow);
			if (e.type == SDL_MOUSEMOTION && e.motion.which != SDL_TOUCH_MOUSEID)
				movePointer(&pointer, &state, catalog.count, INT64_MIN, e.motion.x * scaleX, e.motion.y * scaleY,
				            inputNow);
			if (e.type == SDL_MOUSEBUTTONUP && e.button.button == SDL_BUTTON_LEFT &&
			    e.button.which != SDL_TOUCH_MOUSEID)
				actions |= endPointer(&pointer, &state, catalog.count, INT64_MIN, e.button.x * scaleX,
				                      e.button.y * scaleY, inputNow, false);
			if (e.type == SDL_FINGERDOWN)
				beginPointer(&pointer, &state, e.tfinger.fingerId, e.tfinger.x * 1280, e.tfinger.y * 720, inputNow);
			if (e.type == SDL_FINGERMOTION)
				movePointer(&pointer, &state, catalog.count, e.tfinger.fingerId, e.tfinger.x * 1280, e.tfinger.y * 720,
				            inputNow);
			if (e.type == SDL_FINGERUP)
				actions |= endPointer(&pointer, &state, catalog.count, e.tfinger.fingerId, e.tfinger.x * 1280,
				                      e.tfinger.y * 720, inputNow, false);
			if (e.type == SDL_WINDOWEVENT &&
			    (e.window.event == SDL_WINDOWEVENT_FOCUS_LOST || e.window.event == SDL_WINDOWEVENT_SIZE_CHANGED))
				endPointer(&pointer, &state, catalog.count, pointer.id, pointer.x, pointer.y, inputNow, true);
		}
		double now = SDL_GetPerformanceCounter() / (double) SDL_GetPerformanceFrequency() - origin;
		if (smoke) {
			now = frame / 60.;
			if (frame == 15)
				actions |= PS_ACCEPT;
		}
		if (actions && pointer.active)
			endPointer(&pointer, &state, catalog.count, pointer.id, pointer.x, pointer.y, inputNow, true);
		if (actions & PS_EXIT)
			running = false;
		if ((actions & PS_RESCAN) && state.mode == PS_BROWSE) {
			char* keep = catalog.count ? strdup(catalog.games[state.selected].path) : NULL;
			PSRendererDestroy(renderer);
			PSCatalogScan(&catalog, root);
			PSStateInit(&state, PSCatalogFind(&catalog, keep));
			free(keep);
			renderer = PSRendererCreate(assets, font, error, sizeof(error));
			if (!renderer) {
				result = 1;
				break;
			}
		}
		if ((actions & PS_CLASSIC) && !smoke)
			snprintf(notice, sizeof(notice), "Mac 调试版请从卡带架选游戏；Switch 的 − 键可打开原版文件浏览。");
		PSStateAction(&state, actions, catalog.count, now);
		PSStateUpdate(&state, now);
		PSRendererDraw(renderer, &catalog, &state, notice);
		if (smoke && shots && (frame == 0 || frame == 105 || state.mode == PS_READY || frame == 300)) {
			char path[PATH_MAX];
			snprintf(path, sizeof(path), "%s/native-%03u.png", shots, frame);
			if (!PSRendererScreenshot(renderer, path)) {
				result = 1;
				break;
			}
		}
		int width, height;
		SDL_GL_GetDrawableSize(window, &width, &height);
		PSRendererPresent(renderer, 0, 0, width, height);
		SDL_GL_SwapWindow(window);
		GLenum glError = glGetError();
		if (glError != GL_NO_ERROR) {
			fprintf(stderr, "OpenGL error: 0x%x at frame %u\n", glError, frame);
			result = 1;
			break;
		}
		if (state.mode == PS_READY) {
			char* path = strdup(catalog.games[state.selected].path);
			PSRendererDestroy(renderer);
			renderer = NULL;
			bool ok = smoke ? runCore(path) : launch(window, exe, path);
			free(path);
			if (!ok) {
				snprintf(notice, sizeof(notice), "游戏未能正常启动，请按 − 使用原版浏览器或检查 ROM。");
				if (smoke) {
					result = 1;
					break;
				}
			}
			renderer = PSRendererCreate(assets, font, error, sizeof(error));
			if (!renderer) {
				result = 1;
				break;
			}
			if (!smoke)
				now = SDL_GetPerformanceCounter() / (double) SDL_GetPerformanceFrequency() - origin;
			PSStateReturn(&state, now);
			fprintf(stdout, "Game handoff and renderer recreation: %s\n", ok ? "PASS" : "FAIL");
		}
		if (smoke && frame == 300) {
			if (state.mode != PS_BROWSE)
				result = 1;
			running = false;
		}
		++frame;
	}
	if (error[0])
		fprintf(stderr, "%s\n", error);
	PSRendererDestroy(renderer);
	PSCatalogClear(&catalog);
	if (pad)
		SDL_GameControllerClose(pad);
	SDL_GL_DeleteContext(context);
	SDL_DestroyWindow(window);
	SDL_Quit();
	if (smoke && !result)
		puts("Native GL render, insertion, 240 emulated frames, teardown and return: PASS");
	return result;
}
