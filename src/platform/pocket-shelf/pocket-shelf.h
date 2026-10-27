/* SPDX-License-Identifier: MPL-2.0 */
#ifndef POCKET_SHELF_H
#define POCKET_SHELF_H
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#ifndef PATH_MAX
#define PATH_MAX 4096
#endif
#define PS_MAX_GAMES 4096
#define PS_BOOT_SECONDS 3.9f
#define PS_BOOT_BEGIN 2.85f
#define PS_INSERT_SECONDS (PS_BOOT_BEGIN + PS_BOOT_SECONDS + .25f)
#define PS_RETURN_SECONDS 2.0f

enum PSAction {
	PS_LEFT = 1,
	PS_RIGHT = 2,
	PS_ACCEPT = 4,
	PS_BACK = 8,
	PS_RESCAN = 16,
	PS_INSPECT = 32,
	PS_CLASSIC = 64,
	PS_EXIT = 128,
	PS_REDUCE = 256
};
enum PSMode { PS_BROWSE, PS_INSERT, PS_RETURN, PS_READY };
struct PSGame {
	char* path;
	char* title;
	char* cover;
	uint64_t bytes;
	char system[4];
	char code[5];
};
struct PSCatalog {
	struct PSGame* games;
	size_t count, capacity;
	bool truncated, scanFailed;
};
struct PSVec {
	float x, y, z;
};
struct PSQuat {
	float x, y, z, w;
};
struct PSPose {
	struct PSVec position;
	struct PSQuat rotation;
	float scale;
};
enum PSGestureAxis { PS_GESTURE_PENDING, PS_GESTURE_HORIZONTAL, PS_GESTURE_VERTICAL };
enum PSGestureResult { PS_GESTURE_IGNORED, PS_GESTURE_TAP, PS_GESTURE_SWIPE };
struct PSGesture {
	bool active;
	enum PSGestureAxis axis;
	float x, y, lastX, lastY, startScroll, pitch, velocity;
	double lastTime;
};
struct PSState {
	enum PSMode mode;
	struct PSGesture gesture;
	size_t selected;
	float scroll;
	bool reduced, inspectBack;
	double began, lastUpdate;
	float facing, slide, boot, presentation, focus, fade;
	struct PSPose card, cancelCard, insertCard;
	float cancelFacing, cancelSlide, insertFacing, cancelPresentation, cancelFocus;
	bool cancelSeated;
};

int16_t* PSBootAudioLoad(const char* path, size_t* frames);
void PSCatalogClear(struct PSCatalog*);
bool PSCatalogScan(struct PSCatalog*, const char* root);
size_t PSCatalogFind(const struct PSCatalog*, const char* path);
void PSStateInit(struct PSState*, size_t selected);
void PSStateAction(struct PSState*, unsigned actions, size_t count, double now);
void PSStateUpdate(struct PSState*, double now);
void PSStateReturn(struct PSState*, double now);
bool PSGestureBegin(struct PSState*, float x, float y, float pixelsPerCard, double now);
bool PSGestureMove(struct PSState*, size_t count, float x, float y, double now);
enum PSGestureResult PSGestureEnd(struct PSState*, size_t count, float x, float y, double now, bool cancelled);
void PSGestureCancel(struct PSState*, size_t count, double now);
unsigned PSShelfTapAction(struct PSState*, size_t count, float x, float y);
struct PSPose PSHandheldPose(float facing, float presentation, float focus);
struct PSPose PSCardHome(float offset);
struct PSVec PSVecMix(struct PSVec a, struct PSVec b, float t);
struct PSQuat PSQuatMix(struct PSQuat a, struct PSQuat b, float t);
struct PSQuat PSQuatMul(struct PSQuat a, struct PSQuat b);
struct PSVec PSRotate(struct PSQuat, struct PSVec);
void PSPoseMatrix(struct PSPose, float out[16]);
#endif
