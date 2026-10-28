/* SPDX-License-Identifier: MPL-2.0 */
/* Render the real native selector for documentation, using metadata-only cards.
 * This tool never opens a ROM or launches an emulator. See docs/MEDIA.md.
 */
#include "renderer.h"
#include <SDL.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>

static bool screenshot(struct PSRenderer* renderer, const char* directory, const char* name) {
	char path[PATH_MAX];
	if (snprintf(path, sizeof(path), "%s/%s", directory, name) >= (int) sizeof(path))
		return false;
	return PSRendererScreenshot(renderer, path);
}

int main(int argc, char** argv) {
	if (argc != 3) {
		fprintf(stderr, "Usage: %s REPOSITORY_ROOT OUTPUT_DIRECTORY\n", argv[0]);
		return 2;
	}
	char assets[PATH_MAX], font[PATH_MAX], error[512] = { 0 };
	snprintf(assets, sizeof(assets), "%s/contrib/pocket-shelf/assets/native", argv[1]);
	snprintf(font, sizeof(font), "%s/contrib/pocket-shelf/assets/fonts/NotoSansSC-Regular.otf", argv[1]);
	if (SDL_Init(SDL_INIT_VIDEO)) {
		fprintf(stderr, "%s\n", SDL_GetError());
		return 1;
	}
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 2);
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_CORE);
	SDL_Window* window =
	    SDL_CreateWindow("Pocket Shelf documentation capture", 0, 0, 1280, 720, SDL_WINDOW_OPENGL | SDL_WINDOW_HIDDEN);
	SDL_GLContext context = window ? SDL_GL_CreateContext(window) : NULL;
	if (!context) {
		fprintf(stderr, "%s\n", SDL_GetError());
		if (window)
			SDL_DestroyWindow(window);
		SDL_Quit();
		return 1;
	}
	struct PSRenderer* renderer = PSRendererCreate(assets, font, error, sizeof(error));
	if (!renderer) {
		fprintf(stderr, "%s\n", error);
		SDL_GL_DeleteContext(context);
		SDL_DestroyWindow(window);
		SDL_Quit();
		return 1;
	}
	/* Same illustrative labels and public metadata as the browser's demo library. */
	struct PSGame games[] = {
		{ .title = "Anguna", .bytes = 1710888, .system = "GBA" },
		{ .title = "Apotris 4.2.0", .bytes = 4194304, .system = "GBA" },
		{ .title = "Celeste Classic 1.2", .bytes = 5418424, .system = "GBA" },
	};
	struct PSCatalog catalog = { .games = games, .count = 3 };
	struct PSState state;
	PSStateInit(&state, 1);
	const unsigned fps = 15, acceptFrame = 42;
	const unsigned bootFrame = acceptFrame + (unsigned) lroundf((PS_BOOT_BEGIN + PS_BOOT_SECONDS - .6f) * fps);
	const unsigned rearFrame = acceptFrame + 31;
	const unsigned lastFrame =
	    acceptFrame + (unsigned) ceilf((PS_INSERT_SECONDS + .2f + PS_RETURN_SECONDS + .8f) * fps);
	unsigned returnFrame = 0;
	int result = 0;
	for (unsigned frame = 0; frame <= lastFrame; ++frame) {
		double now = frame / (double) fps;
		SDL_PumpEvents();
		if (frame == 12)
			PSStateAction(&state, PS_RIGHT, catalog.count, now);
		if (frame == 25)
			PSStateAction(&state, PS_LEFT, catalog.count, now);
		if (frame == acceptFrame)
			PSStateAction(&state, PS_ACCEPT, catalog.count, now);
		if (returnFrame && frame == returnFrame)
			PSStateReturn(&state, now);
		PSStateUpdate(&state, now);
		if (state.mode == PS_READY && !returnFrame)
			returnFrame = frame + 3;
		PSRendererDraw(renderer, &catalog, &state, "原生 Mac 调试录制 · 示例卡带 · 不含游戏 ROM");
		char name[64];
		snprintf(name, sizeof(name), "frame-%04u.png", frame);
		if (!screenshot(renderer, argv[2], name)) {
			result = 1;
			break;
		}
		if ((frame == 0 && !screenshot(renderer, argv[2], "native-shelf.png")) ||
		    (frame == rearFrame && !screenshot(renderer, argv[2], "native-insertion.png")) ||
		    (frame == bootFrame && !screenshot(renderer, argv[2], "native-boot.png"))) {
			result = 1;
			break;
		}
	}
	if (!result && state.mode != PS_BROWSE)
		result = 1;
	PSRendererDestroy(renderer);
	SDL_GL_DeleteContext(context);
	SDL_DestroyWindow(window);
	SDL_Quit();
	if (!result)
		printf("Rendered %u frames at %u fps; returned to the initial shelf. No ROM was loaded.\n", lastFrame + 1, fps);
	return result;
}
