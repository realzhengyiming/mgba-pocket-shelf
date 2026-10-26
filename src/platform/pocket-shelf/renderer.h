/* SPDX-License-Identifier: MPL-2.0 */
#ifndef POCKET_SHELF_RENDERER_H
#define POCKET_SHELF_RENDERER_H
#include "pocket-shelf.h"
struct PSRenderer;
/* Assets are baked from this fork's original browser model; never game files. */
struct PSRenderer* PSRendererCreate(const char* assets, const char* font, char* error, size_t errorSize);
void PSRendererDestroy(struct PSRenderer*);
void PSRendererDraw(struct PSRenderer*, const struct PSCatalog*, const struct PSState*, const char* notice);
void PSRendererPresent(struct PSRenderer*, int x, int y, int width, int height);
bool PSRendererScreenshot(struct PSRenderer*, const char* path);
#endif
