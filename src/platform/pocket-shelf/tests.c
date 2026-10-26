/* SPDX-License-Identifier: MPL-2.0 */
#define _POSIX_C_SOURCE 200809L
#include "pocket-shelf.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>
#define CLOSE(a, b) assert(fabsf((a) - (b)) < .0001f)
static void touch(const char* path) {
	FILE* f = fopen(path, "wb");
	assert(f);
	fputs("test", f);
	fclose(f);
}
int main(void) {
	char root[] = "/tmp/pocket-shelf-test-XXXXXX";
	assert(mkdtemp(root));
	char path[PATH_MAX], nested[PATH_MAX], rom[PATH_MAX], cover[PATH_MAX], link[PATH_MAX];
	snprintf(nested, sizeof(nested), "%s/folder", root);
	assert(!mkdir(nested, 0700));
	snprintf(rom, sizeof(rom), "%s/A game ' quote 绿宝石.GBA", root);
	touch(rom);
	snprintf(cover, sizeof(cover), "%s/A game ' quote 绿宝石.png", root);
	touch(cover);
	snprintf(path, sizeof(path), "%s/A game ' quote 绿宝石.GBA", nested);
	touch(path);
	snprintf(link, sizeof(link), "%s/loop", nested);
	assert(!symlink(root, link));
	struct PSCatalog c = { 0 };
	assert(PSCatalogScan(&c, root));
	assert(c.count == 2);
	assert(strcmp(c.games[0].path, c.games[1].path));
	size_t index = PSCatalogFind(&c, rom);
	assert(!strcmp(c.games[index].path, rom));
	assert(!strcmp(c.games[index].cover, cover));
	assert(!strcmp(c.games[index].system, "GBA"));
	assert(c.games[index].bytes == 4);
	PSCatalogClear(&c);
	assert(!c.games && !c.count);
	assert(!PSCatalogScan(&c, "/this/path/does/not/exist"));
	assert(c.scanFailed && !c.count);
	PSCatalogClear(&c);
	unlink(rom);
	unlink(cover);
	unlink(path);
	unlink(link);
	rmdir(nested);
	rmdir(root);
	struct PSState s;
	PSStateInit(&s, 0);
	PSStateAction(&s, PS_ACCEPT, 0, 0);
	assert(s.mode == PS_BROWSE);
	PSStateAction(&s, PS_ACCEPT, 3, 0);
	PSStateUpdate(&s, 1.5);
	assert(s.mode == PS_INSERT);
	CLOSE(s.facing, 1);
	assert(s.slide > 0 && s.slide < 1);
	CLOSE(s.boot, 0);
	struct PSPose before = s.card;
	PSStateAction(&s, PS_BACK, 3, 1.5);
	PSStateUpdate(&s, 1.5);
	CLOSE(s.card.position.x, before.position.x);
	CLOSE(s.card.position.y, before.position.y);
	PSStateUpdate(&s, 3);
	assert(s.mode == PS_BROWSE);
	PSStateAction(&s, PS_ACCEPT, 3, 4);
	PSStateUpdate(&s, 6.1);
	CLOSE(s.slide, 1);
	assert(s.facing < 1 && s.facing > 0);
	CLOSE(s.boot, 0);
	PSStateUpdate(&s, 7.1);
	assert(s.mode == PS_READY);
	CLOSE(s.facing, 0);
	CLOSE(s.boot, 1);
	PSStateReturn(&s, 8);
	PSStateUpdate(&s, 8.2);
	assert(s.facing > 0);
	CLOSE(s.slide, 1);
	PSStateUpdate(&s, 8.5);
	CLOSE(s.facing, 1);
	assert(s.slide < 1 && s.slide > 0);
	PSStateUpdate(&s, 9.3);
	assert(s.mode == PS_BROWSE);
	CLOSE(s.facing, 0);
	PSStateAction(&s, PS_LEFT, 3, 10);
	assert(s.selected == 0);
	PSStateAction(&s, PS_RIGHT, 3, 10);
	assert(s.selected == 1);
	PSStateAction(&s, PS_REDUCE | PS_ACCEPT, 3, 11);
	PSStateUpdate(&s, 11.21);
	assert(s.mode == PS_READY);
	PSStateInit(&s, 0);
	s.facing = 1;
	s.inspectBack = true;
	PSStateAction(&s, PS_ACCEPT, 1, 0);
	PSStateUpdate(&s, 0);
	CLOSE(s.facing, 1);
	puts("Catalogue, original filenames, cover lookup, symlink loop, insertion/cancel/ejection and reduced motion: "
	     "PASS");
	return 0;
}
