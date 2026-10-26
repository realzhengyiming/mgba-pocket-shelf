/* SPDX-License-Identifier: MPL-2.0
 * Included only by the Switch adapter, so all platform state remains private.
 */
#include "platform/pocket-shelf/renderer.h"

static int _selectPocketGame(struct mGUIRunner* runner, char* path, size_t capacity) {
	static bool returning;
	const char* root = mCoreConfigGetValue(&runner->config, "pocketShelfRoms");
	if (!root || !*root)
		root = "sdmc:/roms";
	struct PSCatalog catalog = { 0 };
	PSCatalogScan(&catalog, root);
	const char* lastGame = mCoreConfigGetValue(&runner->config, "lastGame");
	struct PSState state;
	PSStateInit(&state, lastGame ? PSCatalogFind(&catalog, lastGame) : catalog.count > 1 ? 1 : 0);
	int reduced = 0;
	mCoreConfigGetIntValue(&runner->config, "pocketShelfReducedMotion", &reduced);
	state.reduced = reduced != 0;
	char error[512] = { 0 };
	struct PSRenderer* renderer =
	    PSRendererCreate("romfs:/pocket-shelf", "romfs:/pocket-shelf/NotoSansSC-Regular.otf", error, sizeof(error));
	if (!renderer) {
		printf("Pocket Shelf: %s; opening original browser\n", error);
		PSCatalogClear(&catalog);
		return -1;
	}
	double origin = armGetSystemTick() / 19200000.;
	if (returning && catalog.count)
		PSStateReturn(&state, 0);
	returning = false;
	int result = 0;
	u64 previousDirections = 0;
	double nextRepeat = 0;
	bool wasTouch = false;
	eglSwapInterval(s_display, 1);
	while (_running(runner)) {
		double now = armGetSystemTick() / 19200000. - origin;
		padUpdate(&pad);
		u64 down = padGetButtonsDown(&pad), held = padGetButtons(&pad);
		HidAnalogStickState stick = padGetStickPos(&pad, 0);
		u64 directions = held & (HidNpadButton_Left | HidNpadButton_Right);
		if (stick.x < -ANALOG_DEADZONE)
			directions |= HidNpadButton_Left;
		if (stick.x > ANALOG_DEADZONE)
			directions |= HidNpadButton_Right;
		unsigned actions = 0;
		if (directions != previousDirections || now >= nextRepeat) {
			if (directions & HidNpadButton_Left)
				actions |= PS_LEFT;
			if (directions & HidNpadButton_Right)
				actions |= PS_RIGHT;
			nextRepeat = now + (directions != previousDirections ? .32 : .12);
		}
		previousDirections = directions;
		if (down & HidNpadButton_A)
			actions |= PS_ACCEPT;
		if (down & HidNpadButton_B)
			actions |= PS_BACK;
		if (down & HidNpadButton_X)
			actions |= PS_RESCAN;
		if (down & HidNpadButton_Y)
			actions |= PS_INSPECT;
		if (down & HidNpadButton_ZR)
			actions |= PS_REDUCE;
		if (down & HidNpadButton_Plus) {
			result = 0;
			break;
		}
		if ((down & HidNpadButton_Minus) && state.mode == PS_BROWSE) {
			result = -1;
			break;
		}
		HidTouchScreenState touch = { 0 };
		hidGetTouchScreenStates(&touch, 1);
		if (touch.count && !wasTouch && state.mode == PS_BROWSE) {
			unsigned x = touch.touches[0].x, y = touch.touches[0].y;
			if (y > 620 && x > 500 && x < 790)
				actions |= PS_ACCEPT;
			else if (y > 230 && y < 500 && x < 650) {
				if (x < 270)
					actions |= PS_LEFT;
				else if (x > 450)
					actions |= PS_RIGHT;
				else
					actions |= PS_ACCEPT;
			}
		}
		wasTouch = touch.count > 0;
		if ((actions & PS_RESCAN) && state.mode == PS_BROWSE) {
			char* keep = catalog.count ? strdup(catalog.games[state.selected].path) : NULL;
			PSRendererDestroy(renderer);
			PSCatalogScan(&catalog, root);
			bool reducedMotion = state.reduced;
			PSStateInit(&state, PSCatalogFind(&catalog, keep));
			state.reduced = reducedMotion;
			free(keep);
			renderer = PSRendererCreate("romfs:/pocket-shelf", "romfs:/pocket-shelf/NotoSansSC-Regular.otf", error,
			                            sizeof(error));
			if (!renderer) {
				result = -1;
				break;
			}
		}
		PSStateAction(&state, actions, catalog.count, now);
		PSStateUpdate(&state, now);
		PSRendererDraw(renderer, &catalog, &state, NULL);
		PSRendererPresent(renderer, 0, 1080 - vheight, vwidth, vheight);
		eglSwapBuffers(s_display, s_surface);
		if (state.mode == PS_READY) {
			size_t length = strlen(catalog.games[state.selected].path);
			if (length < capacity) {
				memcpy(path, catalog.games[state.selected].path, length + 1);
				result = 1;
				returning = true;
			} else
				result = -1;
			break;
		}
	}
	mCoreConfigSetIntValue(&runner->config, "pocketShelfReducedMotion", state.reduced);
	mCoreConfigSave(&runner->config);
	PSRendererDestroy(renderer);
	PSCatalogClear(&catalog);
	glViewport(0, 1080 - vheight, vwidth, vheight);
	return result;
}
