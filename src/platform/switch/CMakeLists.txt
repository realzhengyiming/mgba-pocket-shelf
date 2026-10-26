find_program(ELF2NRO elf2nro)
find_program(NACPTOOL nacptool)
find_program(BUILD_ROMFS build_romfs)
find_library(GLAPI_LIBRARY glapi REQUIRED)
find_library(EGL_LIBRARY EGL REQUIRED)

set(OS_DEFINES _GNU_SOURCE IOAPI_NO_64 ENABLE_VFS_FD)
list(APPEND VFS_SRC ${PROJECT_SOURCE_DIR}/src/util/vfs/vfs-fd.c ${PROJECT_SOURCE_DIR}/src/util/vfs/vfs-dirent.c)
list(APPEND GUI_SRC ${CMAKE_CURRENT_SOURCE_DIR}/gui-font.c)

include_directories(AFTER ${OPENGLES3_INCLUDE_DIR} ${OPENGL_EGL_INCLUDE_DIR})

if(${CMAKE_BUILD_TYPE} STREQUAL Debug OR ${CMAKE_BUILD_TYPE} STREQUAL RelWithDebInfo)
	find_library(NOUVEAU_LIBRARY drm_nouveaud REQUIRED)
	list(APPEND OS_LIB nxd)
else()
	find_library(NOUVEAU_LIBRARY drm_nouveau REQUIRED)
	list(APPEND OS_LIB nx)
endif()
set(VFS_SRC ${VFS_SRC} PARENT_SCOPE)
set(OS_DEFINES ${OS_DEFINES} PARENT_SCOPE)
set(OS_LIB ${OS_LIB} PARENT_SCOPE)

if(BUILD_PERF)
	add_custom_target(${BINARY_NAME}-perf.nro ALL
	                  ${ELF2NRO} ../${BINARY_NAME}-perf ${BINARY_NAME}-perf.nro
	                  DEPENDS ${BINARY_NAME}-perf)
	install(FILES
		    ${CMAKE_CURRENT_BINARY_DIR}/${BINARY_NAME}-perf.nro
		    DESTINATION . COMPONENT ${BINARY_NAME}-perf)
endif()

option(BUILD_POCKET_SHELF "Use the native cartridge shelf in the Switch frontend" OFF)
set(POCKET_SHELF_SRC)
set(POCKET_SHELF_LIB)
set(POCKET_SHELF_ASSETS "${PROJECT_SOURCE_DIR}/contrib/pocket-shelf/assets")
if(BUILD_POCKET_SHELF)
    find_package(Freetype REQUIRED)
    list(APPEND POCKET_SHELF_SRC ../pocket-shelf/pocket-shelf.c ../pocket-shelf/renderer.c)
    # devkitPro's static FreeType uses HarfBuzz and bzip2. HarfBuzz also
    # refers back to FreeType, so resolve this cycle as one linker group.
    find_library(POCKET_HARFBUZZ_LIBRARY harfbuzz REQUIRED)
    find_library(POCKET_BZIP2_LIBRARY bz2 REQUIRED)
    list(APPEND POCKET_SHELF_LIB -Wl,--start-group ${FREETYPE_LIBRARIES}
         ${POCKET_HARFBUZZ_LIBRARY} ${POCKET_BZIP2_LIBRARY}
         ${PNG_LIBRARIES} ${ZLIB_LIBRARIES} -Wl,--end-group)
endif()

add_executable(${BINARY_NAME}.elf ${GUI_SRC} ${PLATFORM_SRC} ${POCKET_SHELF_SRC} main.c)
if(BUILD_POCKET_SHELF)
    target_include_directories(${BINARY_NAME}.elf PRIVATE ${FREETYPE_INCLUDE_DIRS} ${PNG_INCLUDE_DIRS})
endif()
set_target_properties(${BINARY_NAME}.elf PROPERTIES COMPILE_DEFINITIONS "${OS_DEFINES};${FEATURE_DEFINES};${FUNCTION_DEFINES}")
if(BUILD_POCKET_SHELF)
    target_compile_definitions(${BINARY_NAME}.elf PRIVATE ENABLE_POCKET_SHELF)
endif()
target_link_libraries(${BINARY_NAME}.elf ${BINARY_NAME} ${M_LIBRARY} ${EGL_LIBRARY} ${OPENGLES3_LIBRARY} ${GLAPI_LIBRARY} ${NOUVEAU_LIBRARY} ${POCKET_SHELF_LIB} stdc++ ${OS_LIB})

if(BUILD_POCKET_SHELF)
    set(SWITCH_APP_NAME "mGBA Pocket Shelf")
    set(SWITCH_APP_AUTHOR "mGBA contributors / Pocket Shelf fork")
else()
    set(SWITCH_APP_NAME "${PROJECT_NAME}")
    set(SWITCH_APP_AUTHOR "endrift")
endif()
add_custom_command(OUTPUT control.nacp
                   COMMAND ${NACPTOOL} --create "${SWITCH_APP_NAME}" "${SWITCH_APP_AUTHOR}" "${VERSION_STRING}" control.nacp)

set(POCKET_ROMFS_COMMANDS)
set(POCKET_ROMFS_DEPENDS)
if(BUILD_POCKET_SHELF)
    file(GLOB POCKET_ROMFS_DEPENDS "${POCKET_SHELF_ASSETS}/native/*" "${POCKET_SHELF_ASSETS}/fonts/*")
    list(APPEND POCKET_ROMFS_COMMANDS
        COMMAND ${CMAKE_COMMAND} -E copy_directory "${POCKET_SHELF_ASSETS}/native" romfs/pocket-shelf
        COMMAND ${CMAKE_COMMAND} -E copy "${POCKET_SHELF_ASSETS}/fonts/NotoSansSC-Regular.otf" romfs/pocket-shelf/
        COMMAND ${CMAKE_COMMAND} -E copy "${POCKET_SHELF_ASSETS}/fonts/LICENSE.txt" romfs/pocket-shelf/FONT-LICENSE.txt)
endif()

add_custom_command(OUTPUT romfs.bin
                   COMMAND ${CMAKE_COMMAND} -E make_directory romfs
                   COMMAND ${CMAKE_COMMAND} -E copy "${PROJECT_SOURCE_DIR}/res/font-new.png" romfs/
                   COMMAND ${CMAKE_COMMAND} -E copy "${CMAKE_CURRENT_SOURCE_DIR}/fileassoc.cfg.in" romfs/
                   ${POCKET_ROMFS_COMMANDS}
                   COMMAND ${BUILD_ROMFS} romfs romfs.bin
                   COMMAND ${CMAKE_COMMAND} -E remove_directory romfs
               DEPENDS "${PROJECT_SOURCE_DIR}/res/font-new.png" "${CMAKE_CURRENT_SOURCE_DIR}/fileassoc.cfg.in" ${POCKET_ROMFS_DEPENDS})

add_custom_target(${BINARY_NAME}.nro ALL
                  ${ELF2NRO} ${BINARY_NAME}.elf ${BINARY_NAME}.nro --romfs=romfs.bin --nacp=control.nacp --icon="${CMAKE_CURRENT_SOURCE_DIR}/icon.jpg"
                  DEPENDS ${BINARY_NAME}.elf control.nacp ${CMAKE_CURRENT_SOURCE_DIR}/icon.jpg romfs.bin)

install(TARGETS ${BINARY_NAME}.elf DESTINATION . COMPONENT ${BINARY_NAME}-dbg)
install(FILES ${CMAKE_CURRENT_BINARY_DIR}/${BINARY_NAME}.nro DESTINATION . COMPONENT ${BINARY_NAME}-switch)
