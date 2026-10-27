/* SPDX-License-Identifier: MPL-2.0
 * Included only by the Switch adapter, so all platform state remains private.
 */
#include "platform/pocket-shelf/renderer.h"

#include <stdarg.h>
#include <time.h>

static void _pocketLog(const char* format, ...) {
	FILE* file = fopen("sdmc:/mGBA/pocket-shelf.log", "a");
	if (!file)
		return;
	fprintf(file, "[%lld] ", (long long) time(NULL));
	va_list args;
	va_start(args, format);
	vfprintf(file, format, args);
	va_end(args);
	fputc('\n', file);
	fclose(file);
}
static int _pocketStartupError(struct mGUIRunner* runner, const char* error) {
	_pocketLog("STARTUP FAILED: %s", error);
	/* The original bitmap font works even if the shelf/CJK font failed. */
	while (_running(runner)) {
		_drawStart();
		_guiPrepare();
		GUIFontPrint(font, 64, 120, GUI_ALIGN_LEFT, 0xFFFFFFFF, "Pocket Shelf could not start");
		const char* text = error;
		for (unsigned row = 0; *text && row < 6; ++row) {
			char line[79];
			unsigned length = 0;
			while (text[length] && text[length] != '\n' && length < sizeof(line) - 1)
				++length;
			memcpy(line, text, length);
			line[length] = 0;
			GUIFontPrint(font, 64, 210 + row * 40, GUI_ALIGN_LEFT, 0xFFFFFFFF, line);
			text += length;
			if (*text == '\n')
				++text;
		}
		GUIFontPrint(font, 64, 560, GUI_ALIGN_LEFT, 0xFFFFFFFF, "Log: /mGBA/pocket-shelf.log");
		GUIFontPrint(font, 64, 620, GUI_ALIGN_LEFT, 0xFFFFFFFF, "A/B: classic browser     +: exit");
		_guiFinish();
		eglSwapBuffers(s_display, s_surface);
		padUpdate(&pad);
		u64 down = padGetButtonsDown(&pad);
		if (down & HidNpadButton_Plus)
			return 0;
		if (down & (HidNpadButton_A | HidNpadButton_B))
			return -1;
	}
	return 0;
}

static int _selectPocketGame(struct mGUIRunner* runner, char* path, size_t capacity) {
	static bool returning;
	u64 totalMemory = 0, usedMemory = 0;
	svcGetInfo(&totalMemory, InfoType_TotalMemorySize, CUR_PROCESS_HANDLE, 0);
	svcGetInfo(&usedMemory, InfoType_UsedMemorySize, CUR_PROCESS_HANDLE, 0);
	_pocketLog("PICKER entered; applet=%u memory=%llu/%llu MiB; GL=%s GLSL=%s renderer=%s",
	           (unsigned) appletGetAppletType(), (unsigned long long) (usedMemory >> 20),
	           (unsigned long long) (totalMemory >> 20), glGetString(GL_VERSION),
	           glGetString(GL_SHADING_LANGUAGE_VERSION), glGetString(GL_RENDERER));
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
		PSCatalogClear(&catalog);
		return _pocketStartupError(runner, error);
	}
	_pocketLog("READY: native shelf initialized; games=%zu root=%s", catalog.count, root);
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
			_pocketLog("Classic browser requested with Minus");
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
				result = _pocketStartupError(runner, error);
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
