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
#define PS_INSERT_SECONDS 3.05f
#define PS_RETURN_SECONDS 1.25f

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
struct PSState {
	enum PSMode mode;
	size_t selected;
	float scroll;
	bool reduced, inspectBack;
	double began, lastUpdate;
	float facing, slide, boot;
	struct PSPose card, cancelCard, insertCard;
	float cancelFacing, cancelSlide, insertFacing;
	bool cancelSeated;
};

void PSCatalogClear(struct PSCatalog*);
bool PSCatalogScan(struct PSCatalog*, const char* root);
size_t PSCatalogFind(const struct PSCatalog*, const char* path);
void PSStateInit(struct PSState*, size_t selected);
void PSStateAction(struct PSState*, unsigned actions, size_t count, double now);
void PSStateUpdate(struct PSState*, double now);
void PSStateReturn(struct PSState*, double now);
struct PSPose PSHandheldPose(float facing);
struct PSPose PSCardHome(float offset);
struct PSVec PSVecMix(struct PSVec a, struct PSVec b, float t);
struct PSQuat PSQuatMix(struct PSQuat a, struct PSQuat b, float t);
struct PSQuat PSQuatMul(struct PSQuat a, struct PSQuat b);
struct PSVec PSRotate(struct PSQuat, struct PSVec);
void PSPoseMatrix(struct PSPose, float out[16]);
#endif
