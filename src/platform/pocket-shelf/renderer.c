/* SPDX-License-Identifier: MPL-2.0 */
#include "renderer.h"
#ifdef __SWITCH__
#include <GLES3/gl3.h>
#elif defined(__APPLE__)
#define GL_SILENCE_DEPRECATION
#include <OpenGL/gl3.h>
#else
#define GL_GLEXT_PROTOTYPES
#include <SDL_opengl.h>
#endif
#include <ft2build.h>
#include FT_FREETYPE_H
#include <math.h>
#include <png.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WIDTH 1280
#define HEIGHT 720
#define MAX_BATCHES 64
#define MAX_TEXTURES 32
#define ATLAS 2048
#define MAX_GLYPHS 4096
struct Batch {
	unsigned group, role, unlit, count;
	int texture;
	GLuint vao, vbo, ibo;
};
struct Glyph {
	uint32_t code;
	unsigned size;
	int x, y, w, h, left, top, advance;
};
struct Cover {
	size_t index;
	bool valid;
	GLuint texture;
};
struct PSRenderer {
	GLuint program, ui, fbo, color, depth, atlas, white, uiVao, uiVbo;
	GLuint textures[MAX_TEXTURES];
	GLint model, view, baseTexture, textured, unlit, opacity, screenBoot;
	GLint uiColor, uiTexture, uiMode;
	struct Batch batches[MAX_BATCHES];
	unsigned batchCount;
	FT_Library ft;
	FT_Face face;
	struct Glyph glyphs[MAX_GLYPHS];
	unsigned glyphCount;
	int atlasX, atlasY, atlasRow;
	struct Cover covers[5];
	char assets[PATH_MAX];
	char error[256];
};
#ifdef __SWITCH__
#define SHADER_HEADER "#version 300 es\nprecision highp float;\n"
#else
#define SHADER_HEADER "#version 150\n"
#endif
static const char* sceneVS =
    SHADER_HEADER "in vec3 position; in vec3 normal; in vec2 uv; in vec4 color;\n"
                  "uniform mat4 model; uniform mat4 viewProjection;\n"
                  "out vec3 n; out vec2 t; out vec4 c;\n"
                  "void main(){gl_Position=viewProjection*model*vec4(position,1);n=mat3(model)*normal;t=uv;c=color;}\n";
static const char* sceneFS = SHADER_HEADER
    "in vec3 n; in vec2 t; in vec4 c; out vec4 frag;\n"
    "uniform sampler2D image; uniform int textured; uniform int unlit; uniform float opacity; uniform float "
    "screenBoot;\n"
    "void main(){vec4 a=c;if(textured==1){vec4 s=texture(image,t);a*=vec4(pow(s.rgb,vec3(2.2)),s.a);}\n"
    "if(screenBoot>=0.){a=vec4(mix(vec3(.028,.07,.036),vec3(.52,.64,.33),screenBoot),1.);"
    "float "
    "line=step(abs(t.y-.3),.006)*step(t.x,.2+.6*screenBoot)*step(.2,t.x);a.rgb=mix(a.rgb,vec3(.15,.24,.09),line);}\n"
    "vec3 light=normalize(vec3(-.4,.8,.7));float diffuse=max(0.,dot(normalize(n),light));"
    "float shade=unlit==1?1.:.62+.58*diffuse;vec3 rgb=pow(clamp(a.rgb*shade,0.,1.),vec3(1./2.2));"
    "frag=vec4(rgb,a.a*opacity);if(frag.a<.015)discard;}\n";
static const char* uiVS = SHADER_HEADER "in vec2 position; in vec2 uv; out vec2 t; void "
                                        "main(){t=uv;gl_Position=vec4(position.x/640.-1.,1.-position.y/360.,0,1);}\n";
static const char* uiFS =
    SHADER_HEADER "in vec2 t; out vec4 frag; uniform vec4 color; uniform sampler2D image; uniform int mode;"
                  "void main(){frag=color;if(mode==1)frag.a*=texture(image,t).r;"
                  "if(mode==2)frag*=texture(image,t);if(mode==3)frag.a*=pow(max(0.,1.-length((t-.5)*2.)),2.);}\n";
static GLuint compile(GLenum type, const char* source, char* error, size_t cap) {
	GLuint shader = glCreateShader(type);
	glShaderSource(shader, 1, &source, NULL);
	glCompileShader(shader);
	GLint ok;
	glGetShaderiv(shader, GL_COMPILE_STATUS, &ok);
	if (!ok) {
		char detail[200] = { 0 };
		glGetShaderInfoLog(shader, sizeof(detail), NULL, detail);
		snprintf(error, cap, "%s shader: %s", type == GL_VERTEX_SHADER ? "Vertex" : "Fragment", detail);
		glDeleteShader(shader);
		return 0;
	}
	return shader;
}
static GLuint program(const char* vs, const char* fs, char* error, size_t cap, bool ui) {
	GLuint a = compile(GL_VERTEX_SHADER, vs, error, cap);
	if (!a)
		return 0;
	GLuint b = compile(GL_FRAGMENT_SHADER, fs, error, cap);
	if (!b) {
		glDeleteShader(a);
		return 0;
	}
	GLuint p = glCreateProgram();
	glAttachShader(p, a);
	glAttachShader(p, b);
	glBindAttribLocation(p, 0, "position");
	glBindAttribLocation(p, 1, ui ? "uv" : "normal");
	if (!ui) {
		glBindAttribLocation(p, 2, "uv");
		glBindAttribLocation(p, 3, "color");
	}
	glLinkProgram(p);
	glDeleteShader(a);
	glDeleteShader(b);
	GLint ok;
	glGetProgramiv(p, GL_LINK_STATUS, &ok);
	if (!ok) {
		char detail[200] = { 0 };
		glGetProgramInfoLog(p, sizeof(detail), NULL, detail);
		snprintf(error, cap, "%s link: %s", ui ? "UI" : "Scene", detail);
		glDeleteProgram(p);
		return 0;
	}
	return p;
}
static GLuint texture(unsigned w, unsigned h, const void* pixels, bool red) {
	GLuint t;
	glGenTextures(1, &t);
	glBindTexture(GL_TEXTURE_2D, t);
	glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
	glTexImage2D(GL_TEXTURE_2D, 0, red ? GL_R8 : GL_RGBA8, (GLsizei) w, (GLsizei) h, 0, red ? GL_RED : GL_RGBA,
	             GL_UNSIGNED_BYTE, pixels);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
	return t;
}
static GLuint pngTexture(const char* path, bool flip) {
	FILE* f = fopen(path, "rb");
	if (!f)
		return 0;
	png_structp p = png_create_read_struct(PNG_LIBPNG_VER_STRING, NULL, NULL, NULL);
	png_infop info = p ? png_create_info_struct(p) : NULL;
	unsigned char* volatile pixels = NULL;
	png_bytep* volatile rows = NULL;
	GLuint result = 0;
	if (!p || !info)
		goto done;
	if (setjmp(png_jmpbuf(p)))
		goto done;
	png_init_io(p, f);
	png_set_user_limits(p, 2048, 2048);
	png_read_info(p, info);
	unsigned w = png_get_image_width(p, info), h = png_get_image_height(p, info);
	int type = png_get_color_type(p, info), bits = png_get_bit_depth(p, info);
	if (!w || !h || w > 2048 || h > 2048)
		goto done;
	if (bits == 16)
		png_set_strip_16(p);
	if (type == PNG_COLOR_TYPE_PALETTE)
		png_set_palette_to_rgb(p);
	if (type == PNG_COLOR_TYPE_GRAY && bits < 8)
		png_set_expand_gray_1_2_4_to_8(p);
	if (png_get_valid(p, info, PNG_INFO_tRNS))
		png_set_tRNS_to_alpha(p);
	if (type == PNG_COLOR_TYPE_GRAY || type == PNG_COLOR_TYPE_GRAY_ALPHA)
		png_set_gray_to_rgb(p);
	if (!(type & PNG_COLOR_MASK_ALPHA) && !png_get_valid(p, info, PNG_INFO_tRNS))
		png_set_filler(p, 255, PNG_FILLER_AFTER);
	png_set_interlace_handling(p);
	png_read_update_info(p, info);
	if (png_get_rowbytes(p, info) != w * 4)
		goto done;
	pixels = malloc((size_t) w * h * 4);
	rows = malloc(h * sizeof(png_bytep));
	if (!pixels || !rows)
		goto done;
	for (unsigned y = 0; y < h; ++y)
		rows[y] = (unsigned char*) pixels + (size_t) (flip ? h - 1 - y : y) * w * 4;
	png_read_image(p, (png_bytepp) rows);
	png_read_end(p, NULL);
	/* Keep the five-cover GPU cache bounded even for large user PNGs. */
	if (flip && (w > 512 || h > 512)) {
		float scale = fminf(512.f / w, 512.f / h);
		unsigned smallW = fmaxf(1, floorf(w * scale)), smallH = fmaxf(1, floorf(h * scale));
		uint32_t* small = malloc((size_t) smallW * smallH * 4);
		if (small) {
			for (unsigned y = 0; y < smallH; ++y)
				for (unsigned x = 0; x < smallW; ++x)
					small[y * smallW + x] = ((uint32_t*) pixels)[(size_t) (y * h / smallH) * w + x * w / smallW];
			result = texture(smallW, smallH, small, false);
			free(small);
		}
	} else {
		result = texture(w, h, (void*) pixels, false);
	}
done:
	free((void*) rows);
	free((void*) pixels);
	if (p)
		png_destroy_read_struct(&p, info ? &info : NULL, NULL);
	fclose(f);
	return result;
}
static bool loadModel(struct PSRenderer* r) {
	char path[PATH_MAX];
	snprintf(path, sizeof(path), "%s/scene.psm", r->assets);
	FILE* f = fopen(path, "rb");
	if (!f) {
		snprintf(r->error, sizeof(r->error), "Cannot open scene.psm");
		return false;
	}
	uint32_t header[4];
	bool ok = false;
	if (fread(header, sizeof(header), 1, f) != 1 || memcmp(header, "PSM1", 4) || header[1] != 1 ||
	    header[2] > MAX_BATCHES)
		goto done;
	for (unsigned i = 0; i < header[2]; ++i) {
		uint32_t h[6];
		if (fread(h, sizeof(h), 1, f) != 1 || h[0] > 2 || h[2] > 2 || h[4] > 1000000 || h[5] > 2000000 || !h[4])
			goto done;
		float* vertices = malloc((size_t) h[4] * 48);
		uint32_t* indices = malloc((size_t) h[5] * 4);
		if (!vertices || !indices) {
			free(vertices);
			free(indices);
			goto done;
		}
		bool read = fread(vertices, 48, h[4], f) == h[4] && fread(indices, 4, h[5], f) == h[5];
		for (unsigned j = 0; read && j < h[5]; ++j)
			if (indices[j] >= h[4])
				read = false;
		if (!read) {
			free(vertices);
			free(indices);
			goto done;
		}
		struct Batch* b = &r->batches[r->batchCount++];
		b->group = h[0];
		b->texture = (int32_t) h[1];
		b->role = h[2];
		b->unlit = h[3];
		b->count = h[5];
		if (b->texture >= MAX_TEXTURES || b->texture < -1) {
			free(vertices);
			free(indices);
			goto done;
		}
		glGenVertexArrays(1, &b->vao);
		glBindVertexArray(b->vao);
		glGenBuffers(1, &b->vbo);
		glBindBuffer(GL_ARRAY_BUFFER, b->vbo);
		glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr) h[4] * 48, vertices, GL_STATIC_DRAW);
		glGenBuffers(1, &b->ibo);
		glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, b->ibo);
		glBufferData(GL_ELEMENT_ARRAY_BUFFER, (GLsizeiptr) h[5] * 4, indices, GL_STATIC_DRAW);
		const unsigned dims[] = { 3, 3, 2, 4 }, offset[] = { 0, 3, 6, 8 };
		for (unsigned j = 0; j < 4; ++j) {
			glEnableVertexAttribArray(j);
			glVertexAttribPointer(j, dims[j], GL_FLOAT, GL_FALSE, 48, (void*) (uintptr_t) (offset[j] * 4));
		}
		free(vertices);
		free(indices);
		if (b->texture >= 0 && !r->textures[b->texture]) {
			snprintf(path, sizeof(path), "%s/texture-%02d.png", r->assets, b->texture);
			r->textures[b->texture] = pngTexture(path, false);
			if (!r->textures[b->texture]) {
				snprintf(r->error, sizeof(r->error), "Cannot load model texture %d", b->texture);
				goto done;
			}
		}
	}
	ok = true;
done:
	fclose(f);
	if (!ok && !r->error[0])
		snprintf(r->error, sizeof(r->error), "Invalid or incomplete model assets");
	return ok;
}
static uint32_t utf8(const char** input) {
	const unsigned char* p = (const unsigned char*) *input;
	uint32_t c = *p++;
	int n = 0;
	if (c >= 0xf0) {
		c &= 7;
		n = 3;
	} else if (c >= 0xe0) {
		c &= 15;
		n = 2;
	} else if (c >= 0xc0) {
		c &= 31;
		n = 1;
	} else if (c >= 0x80)
		c = '?';
	while (n--) {
		if ((*p & 0xc0) != 0x80) {
			c = '?';
			break;
		}
		c = (c << 6) | (*p++ & 0x3f);
	}
	*input = (const char*) p;
	return c;
}
static struct Glyph* glyph(struct PSRenderer* r, uint32_t code, unsigned size) {
	for (unsigned i = 0; i < r->glyphCount; ++i)
		if (r->glyphs[i].code == code && r->glyphs[i].size == size)
			return &r->glyphs[i];
	if (r->glyphCount == MAX_GLYPHS) {
		r->atlasX = ATLAS;
		r->atlasY = ATLAS;
	}
	FT_Set_Pixel_Sizes(r->face, 0, size);
	if (FT_Load_Char(r->face, code, FT_LOAD_RENDER))
		return NULL;
	FT_GlyphSlot slot = r->face->glyph;
	int w = (int) slot->bitmap.width, h = (int) slot->bitmap.rows;
	if (r->atlasX + w + 2 >= ATLAS) {
		r->atlasX = 1;
		r->atlasY += r->atlasRow + 2;
		r->atlasRow = 0;
	}
	if (r->atlasY + h + 2 >= ATLAS) {
		unsigned char* blank = calloc(ATLAS, ATLAS);
		if (!blank)
			return NULL;
		glBindTexture(GL_TEXTURE_2D, r->atlas);
		glTexImage2D(GL_TEXTURE_2D, 0, GL_R8, ATLAS, ATLAS, 0, GL_RED, GL_UNSIGNED_BYTE, blank);
		free(blank);
		r->glyphCount = 0;
		r->atlasX = r->atlasY = 1;
		r->atlasRow = 0;
	}
	struct Glyph* g = &r->glyphs[r->glyphCount++];
	*g = (struct Glyph) {
		code, size, r->atlasX, r->atlasY, w, h, slot->bitmap_left, slot->bitmap_top, (int) (slot->advance.x >> 6)
	};
	if (w && h) {
		unsigned char* buf = malloc((size_t) w * h);
		if (!buf) {
			--r->glyphCount;
			return NULL;
		}
		for (int y = 0; y < h; ++y)
			memcpy(buf + (size_t) y * w, slot->bitmap.buffer + y * slot->bitmap.pitch, w);
		glBindTexture(GL_TEXTURE_2D, r->atlas);
		glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
		glTexSubImage2D(GL_TEXTURE_2D, 0, g->x, g->y, w, h, GL_RED, GL_UNSIGNED_BYTE, buf);
		free(buf);
	}
	r->atlasX += w + 2;
	if (h > r->atlasRow)
		r->atlasRow = h;
	return g;
}
static void quad(struct PSRenderer* r, float x, float y, float w, float h, float u, float v, float uw, float vh,
                 GLuint image, int mode, const float color[4]) {
	float data[] = { x, y, u, v, x + w, y,     u + uw, v,      x + w, y + h, u + uw, v + vh,
	                 x, y, u, v, x + w, y + h, u + uw, v + vh, x,     y + h, u,      v + vh };
	glUseProgram(r->ui);
	glUniform4fv(r->uiColor, 1, color);
	glUniform1i(r->uiTexture, 0);
	glUniform1i(r->uiMode, mode);
	glActiveTexture(GL_TEXTURE0);
	glBindTexture(GL_TEXTURE_2D, image ? image : r->white);
	glBindVertexArray(r->uiVao);
	glBindBuffer(GL_ARRAY_BUFFER, r->uiVbo);
	glBufferSubData(GL_ARRAY_BUFFER, 0, sizeof(data), data);
	glDrawArrays(GL_TRIANGLES, 0, 6);
}
static void rect(struct PSRenderer* r, float x, float y, float w, float h, const float color[4]) {
	quad(r, x, y, w, h, 0, 0, 1, 1, 0, 0, color);
}
static void text(struct PSRenderer* r, float x, float baseline, unsigned size, const char* message, float maxWidth,
                 const float color[4]) {
	float start = x;
	while (*message) {
		uint32_t code = utf8(&message);
		struct Glyph* g = glyph(r, code, size);
		if (!g)
			continue;
		if (x + g->advance > start + maxWidth)
			break;
		if (g->w && g->h)
			quad(r, x + g->left, baseline - g->top, g->w, g->h, g->x / (float) ATLAS, g->y / (float) ATLAS,
			     g->w / (float) ATLAS, g->h / (float) ATLAS, r->atlas, 1, color);
		x += g->advance;
	}
}
static void multiply(const float a[16], const float b[16], float m[16]) {
	float out[16];
	for (int c = 0; c < 4; ++c)
		for (int row = 0; row < 4; ++row) {
			out[c * 4 + row] = 0;
			for (int k = 0; k < 4; ++k)
				out[c * 4 + row] += a[k * 4 + row] * b[c * 4 + k];
		}
	memcpy(m, out, sizeof(out));
}
static struct PSVec normalize(struct PSVec a) {
	float n = sqrtf(a.x * a.x + a.y * a.y + a.z * a.z);
	return (struct PSVec) { a.x / n, a.y / n, a.z / n };
}
static struct PSVec cross(struct PSVec a, struct PSVec b) {
	return (struct PSVec) { a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x };
}
static float dot(struct PSVec a, struct PSVec b) {
	return a.x * b.x + a.y * b.y + a.z * b.z;
}
static void projection(float m[16]) {
	struct PSVec eye = { 3.2f, 5.2f, 12 }, target = { -.13f, .58f, 0 }, up = { 0, 1, 0 };
	struct PSVec z = normalize((struct PSVec) { eye.x - target.x, eye.y - target.y, eye.z - target.z }),
	             x = normalize(cross(up, z)), y = cross(z, x);
	float v[] = { x.x, y.x, z.x, 0, x.y, y.y, z.y, 0, x.z, y.z, z.z, 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1 };
	float p[] = { 2 / 13.8f, 0, 0, 0, 0, 2 / 3.795f, 0, 0, 0, 0, -2 / 99.9f, 0, 0, 0, -100.1f / 99.9f, 1 };
	multiply(p, v, m);
}
static void model(struct PSRenderer* r, unsigned group, struct PSPose pose, GLuint cover, float alpha, float boot) {
	float m[16];
	PSPoseMatrix(pose, m);
	glUseProgram(r->program);
	glUniformMatrix4fv(r->model, 1, GL_FALSE, m);
	glUniform1i(r->baseTexture, 0);
	glUniform1f(r->opacity, alpha);
	for (unsigned i = 0; i < r->batchCount; ++i) {
		struct Batch* b = &r->batches[i];
		if (b->group != group)
			continue;
		GLuint image = b->role == 1 ? cover : b->texture >= 0 ? r->textures[b->texture] : 0;
		glActiveTexture(GL_TEXTURE0);
		glBindTexture(GL_TEXTURE_2D, image ? image : r->white);
		glUniform1i(r->textured, image != 0);
		glUniform1i(r->unlit, b->unlit);
		glUniform1f(r->screenBoot, b->role == 2 ? boot : -1);
		glBindVertexArray(b->vao);
		glDrawElements(GL_TRIANGLES, b->count, GL_UNSIGNED_INT, 0);
	}
}
static GLuint fallback(struct PSRenderer* r, const struct PSGame* game) {
	/* Labels are rendered with the same font atlas as the UI into a small FBO. */
	GLuint label = texture(512, 400, NULL, false), fbo;
	glGenFramebuffers(1, &fbo);
	glBindFramebuffer(GL_FRAMEBUFFER, fbo);
	glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, label, 0);
	glViewport(0, 0, 512, 400);
	glDisable(GL_DEPTH_TEST);
	glClearColor(.91f, .89f, .83f, 1);
	glClear(GL_COLOR_BUFFER_BIT);
	/* UI coordinates are 1280 x 720; the viewport scales into a cartridge label. */
	const float dark[] = { .25f, .34f, .29f, 1 }, cream[] = { .95f, .92f, .81f, 1 }, sage[] = { .62f, .69f, .55f, 1 };
	rect(r, 30, 25, 1220, 525, dark);
	rect(r, 100, 140, 180, 300, sage);
	rect(r, 300, 220, 200, 220, sage);
	rect(r, 525, 100, 210, 340, sage);
	text(r, 90, 525, 52, game->title, 1080, cream);
	text(r, 75, 635, 32, game->title, 1120, dark);
	text(r, 78, 690, 24, game->system, 1100, dark);
	glBindFramebuffer(GL_FRAMEBUFFER, r->fbo);
	glDeleteFramebuffers(1, &fbo);
	return label;
}
static GLuint cover(struct PSRenderer* r, const struct PSCatalog* c, size_t index) {
	struct Cover* entry = &r->covers[index % 5];
	if (entry->valid && entry->index == index)
		return entry->texture;
	if (entry->texture)
		glDeleteTextures(1, &entry->texture);
	GLuint t = c->games[index].cover ? pngTexture(c->games[index].cover, true) : 0;
	if (!t) {
		const char* title = c->games[index].title;
		const char* name = strstr(title, "Anguna") ? "anguna" :
		    strstr(title, "Apotris")               ? "apotris" :
		    strstr(title, "Celeste")               ? "celeste" :
		                                             NULL;
		if (name) {
			char path[PATH_MAX];
			snprintf(path, sizeof(path), "%s/label-%s.png", r->assets, name);
			t = pngTexture(path, false);
		}
	}
	if (!t)
		t = fallback(r, &c->games[index]);
	*entry = (struct Cover) { index, true, t };
	return t;
}
struct PSRenderer* PSRendererCreate(const char* assets, const char* font, char* error, size_t errorSize) {
	struct PSRenderer* r = calloc(1, sizeof(*r));
	if (!r) {
		snprintf(error, errorSize, "Out of memory");
		return NULL;
	}
	snprintf(r->assets, sizeof(r->assets), "%s", assets);
	glBindBuffer(GL_PIXEL_UNPACK_BUFFER, 0);
	glBindBuffer(GL_PIXEL_PACK_BUFFER, 0);
	glPixelStorei(GL_UNPACK_ROW_LENGTH, 0);
	glActiveTexture(GL_TEXTURE0);
	unsigned char white[] = { 255, 255, 255, 255 };
	r->white = texture(1, 1, white, false);
	r->program = program(sceneVS, sceneFS, r->error, sizeof(r->error), false);
	if (!r->program)
		goto fail;
	r->ui = program(uiVS, uiFS, r->error, sizeof(r->error), true);
	if (!r->ui)
		goto fail;
	r->model = glGetUniformLocation(r->program, "model");
	r->view = glGetUniformLocation(r->program, "viewProjection");
	r->baseTexture = glGetUniformLocation(r->program, "image");
	r->textured = glGetUniformLocation(r->program, "textured");
	r->unlit = glGetUniformLocation(r->program, "unlit");
	r->opacity = glGetUniformLocation(r->program, "opacity");
	r->screenBoot = glGetUniformLocation(r->program, "screenBoot");
	r->uiColor = glGetUniformLocation(r->ui, "color");
	r->uiTexture = glGetUniformLocation(r->ui, "image");
	r->uiMode = glGetUniformLocation(r->ui, "mode");
	FT_Error fontError = FT_Init_FreeType(&r->ft);
	if (!fontError)
		fontError = FT_New_Face(r->ft, font, 0, &r->face);
	if (fontError) {
		snprintf(r->error, sizeof(r->error), "CJK font open failed (FreeType %d)", fontError);
		goto fail;
	}
	unsigned char* blank = calloc(ATLAS, ATLAS);
	if (!blank)
		goto fail;
	r->atlas = texture(ATLAS, ATLAS, blank, true);
	free(blank);
	r->atlasX = r->atlasY = 1;
	glGenVertexArrays(1, &r->uiVao);
	glBindVertexArray(r->uiVao);
	glGenBuffers(1, &r->uiVbo);
	glBindBuffer(GL_ARRAY_BUFFER, r->uiVbo);
	glBufferData(GL_ARRAY_BUFFER, 96, NULL, GL_DYNAMIC_DRAW);
	for (unsigned i = 0; i < 2; ++i) {
		glEnableVertexAttribArray(i);
		glVertexAttribPointer(i, 2, GL_FLOAT, GL_FALSE, 16, (void*) (uintptr_t) (i * 8));
	}
	glGenFramebuffers(1, &r->fbo);
	glBindFramebuffer(GL_FRAMEBUFFER, r->fbo);
	r->color = texture(WIDTH, HEIGHT, NULL, false);
	glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, r->color, 0);
	glGenRenderbuffers(1, &r->depth);
	glBindRenderbuffer(GL_RENDERBUFFER, r->depth);
	glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH_COMPONENT24, WIDTH, HEIGHT);
	glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_RENDERBUFFER, r->depth);
	GLenum framebufferStatus = glCheckFramebufferStatus(GL_FRAMEBUFFER);
	if (framebufferStatus != GL_FRAMEBUFFER_COMPLETE) {
		snprintf(r->error, sizeof(r->error), "Framebuffer status 0x%x (GL error 0x%x)", framebufferStatus,
		         glGetError());
		goto fail;
	}
	if (!loadModel(r))
		goto fail;
	glBindVertexArray(0);
	glBindFramebuffer(GL_FRAMEBUFFER, 0);
	return r;
fail:
	snprintf(error, errorSize, "%s", r->error[0] ? r->error : "Cannot allocate shelf graphics");
	PSRendererDestroy(r);
	return NULL;
}
void PSRendererDestroy(struct PSRenderer* r) {
	if (!r)
		return;
	glBindFramebuffer(GL_FRAMEBUFFER, 0);
	glBindVertexArray(0);
	glUseProgram(0);
	for (unsigned i = 0; i < r->batchCount; ++i) {
		glDeleteBuffers(1, &r->batches[i].vbo);
		glDeleteBuffers(1, &r->batches[i].ibo);
		glDeleteVertexArrays(1, &r->batches[i].vao);
	}
	for (unsigned i = 0; i < 5; ++i)
		if (r->covers[i].texture)
			glDeleteTextures(1, &r->covers[i].texture);
	glDeleteTextures(MAX_TEXTURES, r->textures);
	glDeleteTextures(1, &r->white);
	glDeleteTextures(1, &r->atlas);
	glDeleteTextures(1, &r->color);
	glDeleteRenderbuffers(1, &r->depth);
	glDeleteFramebuffers(1, &r->fbo);
	glDeleteBuffers(1, &r->uiVbo);
	glDeleteVertexArrays(1, &r->uiVao);
	glDeleteProgram(r->program);
	glDeleteProgram(r->ui);
	if (r->face)
		FT_Done_Face(r->face);
	if (r->ft)
		FT_Done_FreeType(r->ft);
	glDisable(GL_DEPTH_TEST);
	glDisable(GL_CULL_FACE);
	glDisable(GL_BLEND);
	glDepthMask(GL_TRUE);
	glActiveTexture(GL_TEXTURE0);
	glBindTexture(GL_TEXTURE_2D, 0);
	glBindBuffer(GL_ARRAY_BUFFER, 0);
	glBindBuffer(GL_PIXEL_PACK_BUFFER, 0);
	glBindBuffer(GL_PIXEL_UNPACK_BUFFER, 0);
	glPixelStorei(GL_UNPACK_ALIGNMENT, 4);
	glPixelStorei(GL_UNPACK_ROW_LENGTH, 0);
	free(r);
}
void PSRendererDraw(struct PSRenderer* r, const struct PSCatalog* c, const struct PSState* s, const char* notice) {
	/* Load at most five nearby covers before drawing. No per-ROM mesh allocations. */
	GLuint covers[5] = { 0 };
	size_t anchor = s->mode == PS_BROWSE ? (size_t) lroundf(s->scroll) : s->selected;
	size_t first = anchor > 1 ? anchor - 2 : 0, last = anchor + 2 < c->count ? anchor + 2 : c->count ? c->count - 1 : 0;
	glBindFramebuffer(GL_FRAMEBUFFER, r->fbo);
	glEnable(GL_BLEND);
	glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
	if (c->count)
		for (size_t i = first; i <= last; ++i)
			covers[i - first] = cover(r, c, i);
	glBindFramebuffer(GL_FRAMEBUFFER, r->fbo);
	glViewport(0, 0, WIDTH, HEIGHT);
	glDisable(GL_SCISSOR_TEST);
	glDisable(GL_CULL_FACE);
	glDepthMask(GL_TRUE);
	glDisable(GL_DEPTH_TEST);
	glClearColor(.95f, .94f, .91f, 1);
	glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
	const float ink[] = { .22f, .27f, .21f, 1 }, muted[] = { .53f, .56f, .47f, 1 }, line[] = { .83f, .83f, .77f, 1 },
	            green[] = { .41f, .49f, .32f, 1 }, light[] = { .97f, .96f, .89f, 1 };
	text(r, 64, 62, 30, "pocket shelf", 580, ink);
	text(r, 275, 60, 18, "口袋卡带架 · mGBA", 800, muted);
	rect(r, 64, 86, 1152, 1, line);
	text(r, 65, 139, 14, "YOUR LITTLE GAME COLLECTION", 800, muted);
	text(r, 64, 190, 40, "今天，插哪一盘？", 1020, ink);
	char buffer[128];
	snprintf(buffer, sizeof(buffer), "%02zu  CARTRIDGES", c->count);
	text(r, 1015, 157, 20, buffer, 230, green);
	const float shadow[] = { .32f, .35f, .27f, .13f };
	quad(r, 110, 367, 550, 130, 0, 0, 1, 1, 0, 3, shadow);
	quad(r, 765, 365, 410, 150, 0, 0, 1, 1, 0, 3, shadow);
	glViewport(40, 185, 1200, 330);
	glEnable(GL_DEPTH_TEST);
	glDepthFunc(GL_LEQUAL);
	glClear(GL_DEPTH_BUFFER_BIT);
	float vp[16];
	projection(vp);
	glUseProgram(r->program);
	glUniformMatrix4fv(r->view, 1, GL_FALSE, vp);
	struct PSPose rack = { { -2.62f, 0, .15f }, { 0, 0, 0, 1 }, 1 };
	model(r, 0, rack, 0, 1, -1);
	model(r, 1, PSHandheldPose(s->facing), 0, 1, s->mode == PS_INSERT ? s->boot : s->mode == PS_READY ? 1 : 0);
	if (c->count)
		for (size_t i = first; i <= last; ++i) {
			float offset = (float) i - s->scroll;
			if (fabsf(offset) > 1.75f)
				continue;
			struct PSPose pose = PSCardHome(offset);
			if (i == s->selected && s->mode != PS_BROWSE)
				pose = s->card;
			float alpha = 1 - fmaxf(0, (fabsf(offset) - 1.0f) / .75f);
			if (i == s->selected)
				alpha = 1;
			model(r, 2, pose, covers[i - first], alpha, -1);
		}
	glViewport(0, 0, WIDTH, HEIGHT);
	glDisable(GL_DEPTH_TEST);
	if (c->count) {
		const struct PSGame* g = &c->games[s->selected];
		snprintf(buffer, sizeof(buffer), "%02zu / %02zu", s->selected + 1, c->count);
		text(r, 65, 526, 17, buffer, 500, muted);
		text(r, 64, 570, 32, g->title, 670, ink);
		snprintf(buffer, sizeof(buffer), "%s   ·   %.1f MB   ·   本地卡带", g->system, g->bytes / 1048576.);
		text(r, 65, 603, 17, buffer, 700, muted);
	} else {
		text(r, 64, 548, 30, "卡带架还是空的", 700, ink);
		text(r, 65, 589, 19, "把 .gba / .gb / .gbc 放进 /roms，按 X 重新扫描", 1100, muted);
	}
	const char* status = s->mode == PS_INSERT ? (s->slide < 1    ? "正在从机背插入卡带…" :
	                                                 s->boot > 0 ? "正在开机…" :
	                                                               "卡带已插好") :
	    s->mode == PS_RETURN                  ? "正在放回卡带…" :
	    s->inspectBack                        ? "机背卡槽 · 标签朝外" :
	                                            "掌机正在等一张卡带";
	text(r, 815, 554, 22, status, 400, green);
	text(r, 816, 588, 17, "A 插卡开玩  ·  B 取消  ·  Y 翻面", 400, muted);
	rect(r, 64, 625, 1152, 1, line);
	rect(r, 507, 645, 265, 54, green);
	text(r, 542, 681, 23, s->mode == PS_INSERT ? "插卡中…" : "A   插卡，开玩", 235, light);
	text(r, 64, 679, 18, "左右滑动选卡 · X 扫描", 400, ink);
	text(r, 854, 679, 17, "− 文件浏览    + 退出", 350, muted);
	if (notice && notice[0]) {
		rect(r, 64, 706, 1152, 13, light);
		text(r, 66, 719, 13, notice, 1145, green);
	} else if (c->truncated || c->scanFailed)
		text(r, 65, 719, 13, "部分目录无法读取或列表已达上限；可按 − 使用原版文件浏览。", 1150, green);
	else
		text(r, 65, 719, 13, s->reduced ? "减少动画已开启 · ZR 切换" : "ZR 减少动画 · 退出游戏后回到卡带架", 1150,
		     muted);
	glBindVertexArray(0);
	glUseProgram(0);
}
void PSRendererPresent(struct PSRenderer* r, int x, int y, int width, int height) {
	glBindFramebuffer(GL_READ_FRAMEBUFFER, r->fbo);
	glBindFramebuffer(GL_DRAW_FRAMEBUFFER, 0);
	glBlitFramebuffer(0, 0, WIDTH, HEIGHT, x, y, x + width, y + height, GL_COLOR_BUFFER_BIT, GL_LINEAR);
	glBindFramebuffer(GL_FRAMEBUFFER, 0);
}
bool PSRendererScreenshot(struct PSRenderer* r, const char* path) {
	unsigned char* pixels = malloc(WIDTH * HEIGHT * 4);
	if (!pixels)
		return false;
	glBindBuffer(GL_PIXEL_PACK_BUFFER, 0);
	glBindFramebuffer(GL_FRAMEBUFFER, r->fbo);
	glPixelStorei(GL_PACK_ALIGNMENT, 1);
	glReadPixels(0, 0, WIDTH, HEIGHT, GL_RGBA, GL_UNSIGNED_BYTE, pixels);
	FILE* f = fopen(path, "wb");
	if (!f) {
		free(pixels);
		return false;
	}
	png_structp p = png_create_write_struct(PNG_LIBPNG_VER_STRING, NULL, NULL, NULL);
	png_infop info = p ? png_create_info_struct(p) : NULL;
	bool ok = false;
	if (p && info && !setjmp(png_jmpbuf(p))) {
		png_init_io(p, f);
		png_set_IHDR(p, info, WIDTH, HEIGHT, 8, PNG_COLOR_TYPE_RGBA, PNG_INTERLACE_NONE, PNG_COMPRESSION_TYPE_DEFAULT,
		             PNG_FILTER_TYPE_DEFAULT);
		png_write_info(p, info);
		for (int y = HEIGHT - 1; y >= 0; --y)
			png_write_row(p, pixels + (size_t) y * WIDTH * 4);
		png_write_end(p, info);
		ok = true;
	}
	if (p)
		png_destroy_write_struct(&p, info ? &info : NULL);
	fclose(f);
	free(pixels);
	glBindFramebuffer(GL_FRAMEBUFFER, 0);
	return ok;
}
