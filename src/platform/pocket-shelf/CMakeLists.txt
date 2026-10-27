find_package(Freetype REQUIRED)
find_package(PNG REQUIRED)
find_package(OpenGL REQUIRED)
if(APPLE)
    set(CMAKE_OSX_DEPLOYMENT_TARGET "15.0")
endif()
add_executable(mgba-pocket-shelf desktop.c pocket-shelf.c renderer.c)
target_include_directories(mgba-pocket-shelf PRIVATE ${SDL_INCLUDE_DIR} ${FREETYPE_INCLUDE_DIRS} ${PNG_INCLUDE_DIRS})
target_compile_definitions(mgba-pocket-shelf PRIVATE ${FEATURE_DEFINES} ${FUNCTION_DEFINES} ${OS_DEFINES}
    PS_ASSET_DIR="${PROJECT_SOURCE_DIR}/contrib/pocket-shelf/assets/native"
    PS_FONT_PATH="${PROJECT_SOURCE_DIR}/contrib/pocket-shelf/assets/fonts/NotoSansSC-Regular.otf"
    PS_DEFAULT_ROMS="${PROJECT_SOURCE_DIR}/contrib/pocket-shelf/roms"
    PS_EMULATOR_PATH="$<TARGET_FILE:${BINARY_NAME}-sdl>")
target_link_libraries(mgba-pocket-shelf PRIVATE ${BINARY_NAME} ${SDL_LIBRARY} OpenGL::GL ${FREETYPE_LIBRARIES} ${PNG_LIBRARIES} ${M_LIBRARY})
add_dependencies(mgba-pocket-shelf ${BINARY_NAME}-sdl)
add_executable(pocket-shelf-tests tests.c pocket-shelf.c)
target_link_libraries(pocket-shelf-tests PRIVATE ${M_LIBRARY})
enable_testing()
add_test(NAME pocket-shelf-native COMMAND pocket-shelf-tests "${PROJECT_SOURCE_DIR}/contrib/pocket-shelf/assets/native/boot-chime.wav")

if(APPLE)
    set(POCKET_APP "${CMAKE_BINARY_DIR}/Pocket Shelf.app")
    configure_file(Info.plist.in "${CMAKE_CURRENT_BINARY_DIR}/Info.plist" @ONLY)
    add_custom_command(TARGET mgba-pocket-shelf POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E make_directory "${POCKET_APP}/Contents/MacOS"
        COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:mgba-pocket-shelf>" "${POCKET_APP}/Contents/MacOS/"
        COMMAND ${CMAKE_COMMAND} -E copy "${CMAKE_CURRENT_BINARY_DIR}/Info.plist" "${POCKET_APP}/Contents/Info.plist")
endif()
