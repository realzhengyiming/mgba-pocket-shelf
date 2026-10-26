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
	float touchX = 0, touchY = 0, touchStartX = 0, touchStartY = 0;
	bool touchAllowed = false;
	double lastTouchPoll = 0;
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
		if (actions || (lastTouchPoll && now - lastTouchPoll > .25)) {
			PSGestureCancel(&state, catalog.count, now);
			touchAllowed = false;
		}
		lastTouchPoll = now;
		HidTouchScreenState touch = { 0 };
		hidGetTouchScreenStates(&touch, 1);
		if (touch.count > 1) {
			PSGestureCancel(&state, catalog.count, now);
			touchAllowed = false;
		} else if (touch.count == 1) {
			touchX = touch.touches[0].x;
			touchY = touch.touches[0].y;
			if (!wasTouch) {
				touchStartX = touchX;
				touchStartY = touchY;
				touchAllowed = state.mode == PS_BROWSE && !actions;
				if (touchAllowed && touchX < 690 && touchY > 230 && touchY < 520)
					PSGestureBegin(&state, touchX, touchY, 136, now);
			} else if (touchAllowed) {
				PSGestureMove(&state, catalog.count, touchX, touchY, now);
			}
		} else if (wasTouch && touchAllowed) {
			bool hadGesture = state.gesture.active;
			enum PSGestureResult gesture = PSGestureEnd(&state, catalog.count, touchX, touchY, now, false);
			bool tap = hadGesture ? gesture == PS_GESTURE_TAP : hypotf(touchX - touchStartX, touchY - touchStartY) < 10;
			if (tap)
				actions |= PSShelfTapAction(&state, catalog.count, touchX, touchY);
			touchAllowed = false;
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
