/* SPDX-License-Identifier: MPL-2.0 */
#define _POSIX_C_SOURCE 200809L
#include "pocket-shelf.h"
#include <dirent.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <sys/stat.h>

static float clamp(float t) {
	return fmaxf(0, fminf(1, t));
}
static float smooth(float t) {
	t = clamp(t);
	return t * t * (3 - 2 * t);
}
static float out(float t) {
	t = 1 - clamp(t);
	return 1 - t * t * t;
}
static struct PSQuat euler(float x, float y, float z) {
	float a = cosf(x / 2), b = sinf(x / 2), c = cosf(y / 2), d = sinf(y / 2), e = cosf(z / 2), f = sinf(z / 2);
	return (struct PSQuat) { b * c * e + a * d * f, a * d * e - b * c * f, a * c * f + b * d * e,
	                         a * c * e - b * d * f };
}
struct PSQuat PSQuatMul(struct PSQuat a, struct PSQuat b) {
	return (
	    struct PSQuat) { a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
		                 a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w, a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z };
}
struct PSQuat PSQuatMix(struct PSQuat a, struct PSQuat b, float t) {
	float dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
	if (dot < 0) {
		b.x = -b.x;
		b.y = -b.y;
		b.z = -b.z;
		b.w = -b.w;
		dot = -dot;
	}
	float u = 1 - t, v = t;
	if (dot < .9995f) {
		float angle = acosf(fminf(1, dot)), s = sinf(angle);
		u = sinf((1 - t) * angle) / s;
		v = sinf(t * angle) / s;
	}
	struct PSQuat q = { a.x * u + b.x * v, a.y * u + b.y * v, a.z * u + b.z * v, a.w * u + b.w * v };
	float n = sqrtf(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
	q.x /= n;
	q.y /= n;
	q.z /= n;
	q.w /= n;
	return q;
}
struct PSVec PSVecMix(struct PSVec a, struct PSVec b, float t) {
	return (struct PSVec) { a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t };
}
struct PSVec PSRotate(struct PSQuat q, struct PSVec v) {
	struct PSQuat r =
	    PSQuatMul(PSQuatMul(q, (struct PSQuat) { v.x, v.y, v.z, 0 }), (struct PSQuat) { -q.x, -q.y, -q.z, q.w });
	return (struct PSVec) { r.x, r.y, r.z };
}
void PSPoseMatrix(struct PSPose p, float m[16]) {
	struct PSQuat q = p.rotation;
	float x = q.x, y = q.y, z = q.z, w = q.w, s = p.scale;
	float a[] = { (1 - 2 * (y * y + z * z)) * s,
	              2 * (x * y + z * w) * s,
	              2 * (x * z - y * w) * s,
	              0,
	              2 * (x * y - z * w) * s,
	              (1 - 2 * (x * x + z * z)) * s,
	              2 * (y * z + x * w) * s,
	              0,
	              2 * (x * z + y * w) * s,
	              2 * (y * z - x * w) * s,
	              (1 - 2 * (x * x + y * y)) * s,
	              0,
	              p.position.x,
	              p.position.y,
	              p.position.z,
	              1 };
	memcpy(m, a, sizeof(a));
}
static bool regular(const char* path) {
	struct stat s;
	return !lstat(path, &s) && S_ISREG(s.st_mode);
}
static char* coverFor(const char* path, const char* name) {
	char stem[PATH_MAX], dir[PATH_MAX], test[PATH_MAX];
	snprintf(stem, sizeof(stem), "%s", name);
	char* dot = strrchr(stem, '.');
	if (dot)
		*dot = 0;
	snprintf(dir, sizeof(dir), "%s", path);
	char* slash = strrchr(dir, '/');
	if (slash)
		*slash = 0;
	else
		strcpy(dir, ".");
	const char* patterns[] = { "%s/%s.png", "%s/covers/%s.png", "%s/%s.PNG", "%s/covers/%s.PNG" };
	for (size_t i = 0; i < 4; ++i) {
		int n = snprintf(test, sizeof(test), patterns[i], dir, stem);
		if (n > 0 && n < (int) sizeof(test) && regular(test))
			return strdup(test);
	}
	return NULL;
}
static bool supported(const char* name) {
	const char* e = strrchr(name, '.');
	return e &&
	    (!strcasecmp(e, ".gba") || !strcasecmp(e, ".agb") || !strcasecmp(e, ".gb") || !strcasecmp(e, ".gbc") ||
		 !strcasecmp(e, ".sgb"));
}
static void scan(struct PSCatalog* c, const char* root, unsigned depth) {
	DIR* d = opendir(root);
	if (!d) {
		c->scanFailed = true;
		return;
	}
	struct dirent* e;
	while ((e = readdir(d))) {
		if (e->d_name[0] == '.')
			continue;
		char path[PATH_MAX];
		int n = snprintf(path, sizeof(path), "%s/%s", root, e->d_name);
		if (n <= 0 || n >= (int) sizeof(path)) {
			c->truncated = true;
			continue;
		}
		struct stat st;
		if (lstat(path, &st))
			continue;
		if (S_ISDIR(st.st_mode)) {
			if (depth < 8)
				scan(c, path, depth + 1);
			else
				c->truncated = true;
			continue;
		}
		if (!S_ISREG(st.st_mode) || !supported(e->d_name))
			continue;
		if (c->count == PS_MAX_GAMES) {
			c->truncated = true;
			continue;
		}
		if (c->count == c->capacity) {
			size_t cap = c->capacity ? c->capacity * 2 : 32;
			struct PSGame* games = realloc(c->games, cap * sizeof(*games));
			if (!games) {
				c->truncated = true;
				break;
			}
			c->games = games;
			c->capacity = cap;
		}
		struct PSGame game = { .path = strdup(path),
		                       .title = strdup(e->d_name),
		                       .cover = coverFor(path, e->d_name),
		                       .bytes = (uint64_t) st.st_size };
		if (!game.path || !game.title) {
			free(game.path);
			free(game.title);
			free(game.cover);
			c->truncated = true;
			break;
		}
		char* ext = strrchr(game.title, '.');
		if (ext)
			*ext = 0;
		const char* sourceExt = strrchr(e->d_name, '.');
		strcpy(game.system,
		       !strcasecmp(sourceExt, ".gbc")                                         ? "GBC" :
		           (!strcasecmp(sourceExt, ".gba") || !strcasecmp(sourceExt, ".agb")) ? "GBA" :
		                                                                                "GB");
		c->games[c->count++] = game;
	}
	closedir(d);
}
static int compare(const void* a, const void* b) {
	const struct PSGame* x = a;
	const struct PSGame* y = b;
	int order = strcasecmp(x->title, y->title);
	return order ? order : strcmp(x->path, y->path);
}
void PSCatalogClear(struct PSCatalog* c) {
	for (size_t i = 0; i < c->count; ++i) {
		free(c->games[i].path);
		free(c->games[i].title);
		free(c->games[i].cover);
	}
	free(c->games);
	memset(c, 0, sizeof(*c));
}
bool PSCatalogScan(struct PSCatalog* c, const char* root) {
	PSCatalogClear(c);
	scan(c, root, 0);
	if (c->count > 1)
		qsort(c->games, c->count, sizeof(*c->games), compare);
	return !c->scanFailed;
}
size_t PSCatalogFind(const struct PSCatalog* c, const char* path) {
	if (path)
		for (size_t i = 0; i < c->count; ++i)
			if (!strcmp(c->games[i].path, path))
				return i;
	return 0;
}
struct PSPose PSHandheldPose(float facing) {
	return (struct PSPose) { { 2.43f, .68f, -.17f },
	                         PSQuatMul(euler(-.13f, -.14f, -.055f), euler(0, 3.14159265359f * facing, 0)),
	                         1 };
}
struct PSPose PSCardHome(float offset) {
	return (struct PSPose) { { -2.62f + offset * 1.62f, .295f - fminf(1, fabsf(offset)) * .045f,
	                           .71f - fminf(1, fabsf(offset)) * .23f },
	                         euler(-.09f, -offset * .13f, -offset * .035f),
	                         1 - fminf(1, fabsf(offset)) * .06f };
}
static struct PSPose inSlot(float facing, float slide) {
	struct PSPose machine = PSHandheldPose(facing), card;
	struct PSVec above = { 0, 1.7438f, -.25045f }, seated = { 0, .60928f, -.25045f };
	card.position = PSRotate(machine.rotation, PSVecMix(above, seated, slide));
	card.position.x += machine.position.x;
	card.position.y += machine.position.y;
	card.position.z += machine.position.z;
	card.rotation = PSQuatMul(machine.rotation, euler(0, 3.14159265359f, 0));
	card.scale = 1;
	return card;
}
void PSStateInit(struct PSState* s, size_t selected) {
	memset(s, 0, sizeof(*s));
	s->selected = selected;
	s->scroll = (float) selected;
	s->mode = PS_BROWSE;
	s->card = PSCardHome(0);
}
static void beginReturn(struct PSState* s, double now) {
	s->cancelCard = s->card;
	s->cancelFacing = s->facing;
	s->cancelSlide = s->slide;
	s->cancelSeated = s->slide > 0;
	s->began = now;
	s->mode = PS_RETURN;
	s->inspectBack = false;
}
void PSStateReturn(struct PSState* s, double now) {
	s->facing = 0;
	s->slide = 1;
	s->boot = 1;
	s->card = inSlot(0, 1);
	beginReturn(s, now);
}
void PSStateAction(struct PSState* s, unsigned actions, size_t count, double now) {
	if (actions & PS_REDUCE)
		s->reduced = !s->reduced;
	if (s->mode == PS_BROWSE) {
		if ((actions & PS_LEFT) && s->selected > 0)
			--s->selected;
		if ((actions & PS_RIGHT) && s->selected + 1 < count)
			++s->selected;
		if (actions & PS_INSPECT)
			s->inspectBack = !s->inspectBack;
		if ((actions & PS_ACCEPT) && count) {
			s->insertFacing = s->facing;
			s->insertCard = PSCardHome((float) s->selected - s->scroll);
			s->mode = PS_INSERT;
			s->began = now;
			s->inspectBack = false;
		}
	} else if ((actions & PS_BACK) && s->mode == PS_INSERT)
		beginReturn(s, now);
}
void PSStateUpdate(struct PSState* s, double now) {
	float delta = s->lastUpdate ? fminf(.1f, fmaxf(0, (float) (now - s->lastUpdate))) : 0;
	s->lastUpdate = now;
	s->scroll += ((float) s->selected - s->scroll) * (1 - expf(-14 * delta));
	float t = fmaxf(0, (float) (now - s->began));
	if (s->mode == PS_BROWSE) {
		s->facing += (s->inspectBack - s->facing) * (1 - expf(-10 * delta));
		s->slide = 0;
		s->boot = 0;
		s->card = PSCardHome((float) s->selected - s->scroll);
		return;
	}
	if (s->mode == PS_INSERT) {
		float pick = out(t / .95f), slide = smooth((t - 1.1f) / .65f), turn = smooth((t - 1.75f) / .65f);
		s->facing = (s->insertFacing + (1 - s->insertFacing) * smooth(t / .76f)) * (1 - turn);
		s->slide = slide;
		s->boot = clamp((t - 2.4f) / .65f);
		struct PSPose home = s->insertCard, target = inSlot(1, 0);
		s->card.position = PSVecMix(home.position, target.position, pick);
		s->card.position.y += sinf(pick * 3.14159265359f) * .48f;
		s->card.rotation = PSQuatMix(home.rotation, target.rotation, pick);
		s->card.scale = home.scale + (1 - home.scale) * pick;
		if (t >= 1.1f)
			s->card = inSlot(s->facing, slide);
		if (s->reduced) {
			s->facing = 0;
			s->slide = 1;
			s->boot = clamp(t / .2f);
			s->card = inSlot(0, 1);
		}
		if (t >= (s->reduced ? .2f : PS_INSERT_SECONDS))
			s->mode = PS_READY;
	} else if (s->mode == PS_RETURN) {
		float turn = smooth(t / .34f), lift = smooth((t - .34f) / .26f), fly = out((t - .6f) / .65f);
		struct PSPose start = s->cancelCard;
		s->facing = s->cancelFacing * (1 - out(t / PS_RETURN_SECONDS));
		s->slide = 0;
		s->boot = 0;
		if (s->cancelSeated) {
			s->facing = s->cancelFacing + (1 - s->cancelFacing) * turn;
			start = inSlot(s->facing, s->cancelSlide * (1 - lift));
			s->slide = s->cancelSlide * (1 - lift);
			if (t > .6f)
				s->facing = 1 - smooth((t - .6f) / .65f);
		} else {
			fly = out(t / .65f);
		}
		struct PSPose home = PSCardHome(0);
		s->card.position = PSVecMix(start.position, home.position, fly);
		s->card.position.y += sinf(fly * 3.14159265359f) * .7f;
		s->card.rotation = PSQuatMix(start.rotation, home.rotation, fly);
		s->card.scale = start.scale + (home.scale - start.scale) * fly;
		if (t >= (s->reduced ? .2f : s->cancelSeated ? PS_RETURN_SECONDS : .65f)) {
			s->mode = PS_BROWSE;
			s->facing = 0;
			s->slide = 0;
			s->card = home;
		}
	}
}
