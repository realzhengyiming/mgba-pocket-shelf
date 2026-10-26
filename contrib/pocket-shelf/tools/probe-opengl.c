/* SPDX-License-Identifier: MPL-2.0
 * Exercise a real desktop GL context, shader compilation and pixel readback.
 * This is a development-environment check, not a Switch hardware test. */
#define GL_SILENCE_DEPRECATION
#define GL_GLEXT_PROTOTYPES
#include <SDL.h>
#ifdef __APPLE__
#include <OpenGL/gl3.h>
#else
#include <SDL_opengl.h>
#endif
#include <stdio.h>
#include <stdlib.h>

static GLuint _compile(GLenum type, const char* source) {
	GLuint shader = glCreateShader(type);
	glShaderSource(shader, 1, &source, 0);
	glCompileShader(shader);
	GLint ok = GL_FALSE;
	glGetShaderiv(shader, GL_COMPILE_STATUS, &ok);
	if (!ok) {
		char log[2048];
		glGetShaderInfoLog(shader, sizeof(log), 0, log);
		fprintf(stderr, "Shader failed: %s\n", log);
		glDeleteShader(shader);
		return 0;
	}
	return shader;
}

int main(void) {
	if (SDL_Init(SDL_INIT_VIDEO)) {
		fprintf(stderr, "SDL: %s\n", SDL_GetError());
		return 1;
	}
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_CORE);
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 2);
	SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 0);
	SDL_Window* window = SDL_CreateWindow("Pocket Shelf GL probe", 0, 0, 32, 32, SDL_WINDOW_OPENGL | SDL_WINDOW_HIDDEN);
	SDL_GLContext context = window ? SDL_GL_CreateContext(window) : 0;
	if (!context) {
		fprintf(stderr, "OpenGL context: %s\n", SDL_GetError());
		if (window) {
			SDL_DestroyWindow(window);
		}
		SDL_Quit();
		return 1;
	}
	printf("OpenGL: %s\nRenderer: %s\n", glGetString(GL_VERSION), glGetString(GL_RENDERER));
	const char* vertex = "#version 150\nin vec2 position; void main(){gl_Position=vec4(position,0.0,1.0);}";
	const char* fragment = "#version 150\nout vec4 color; void main(){color=vec4(0.125,0.5,0.25,1.0);}";
	GLuint vs = _compile(GL_VERTEX_SHADER, vertex);
	GLuint fs = _compile(GL_FRAGMENT_SHADER, fragment);
	GLuint program = glCreateProgram();
	if (vs && fs) {
		glAttachShader(program, vs);
		glAttachShader(program, fs);
		glBindAttribLocation(program, 0, "position");
		glLinkProgram(program);
	}
	GLint linked = GL_FALSE;
	glGetProgramiv(program, GL_LINK_STATUS, &linked);
	int result = 1;
	GLuint vao = 0;
	GLuint buffer = 0;
	if (linked) {
		const float vertices[] = {-1, -1, 3, -1, -1, 3};
		glGenVertexArrays(1, &vao);
		glBindVertexArray(vao);
		glGenBuffers(1, &buffer);
		glBindBuffer(GL_ARRAY_BUFFER, buffer);
		glBufferData(GL_ARRAY_BUFFER, sizeof(vertices), vertices, GL_STATIC_DRAW);
		glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 0, 0);
		glEnableVertexAttribArray(0);
		glViewport(0, 0, 32, 32);
		glUseProgram(program);
		glDrawArrays(GL_TRIANGLES, 0, 3);
		unsigned char pixel[4] = {0};
		glReadPixels(16, 16, 1, 1, GL_RGBA, GL_UNSIGNED_BYTE, pixel);
		if (glGetError() == GL_NO_ERROR && abs(pixel[0] - 32) <= 2 && abs(pixel[1] - 128) <= 2 && abs(pixel[2] - 64) <= 2) {
			printf("Shader draw and pixel readback: PASS (%u,%u,%u)\n", pixel[0], pixel[1], pixel[2]);
			result = 0;
		} else {
			fprintf(stderr, "Pixel readback did not match the rendered color\n");
		}
	} else {
		fprintf(stderr, "Shader program failed to link\n");
	}
	glDeleteBuffers(1, &buffer);
	glDeleteVertexArrays(1, &vao);
	glDeleteProgram(program);
	glDeleteShader(vs);
	glDeleteShader(fs);
	SDL_GL_DeleteContext(context);
	SDL_DestroyWindow(window);
	SDL_Quit();
	return result;
}
