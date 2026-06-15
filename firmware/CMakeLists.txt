cmake_minimum_required(VERSION 3.16)

# FIFAWatch firmware root (HAL, Launcher, components)
if(DEFINED ENV{FIFAWATCH_FIRMWARE})
    set(FIFAWATCH_FIRMWARE "$ENV{FIFAWATCH_FIRMWARE}")
else()
    # GrammarBuddy/firmware -> ../../M5_Stack_FIFAWatch/firmware (sibling under code/)
    get_filename_component(FIFAWATCH_FIRMWARE "${CMAKE_CURRENT_LIST_DIR}/../../M5_Stack_FIFAWatch/firmware" ABSOLUTE)
endif()

if(NOT EXISTS "${FIFAWATCH_FIRMWARE}/main/hal/hal.cpp")
    message(FATAL_ERROR
        "M5_Stack_FIFAWatch firmware not found at: ${FIFAWATCH_FIRMWARE}\n"
        "Clone M5_Stack_FIFAWatch and set env FIFAWATCH_FIRMWARE to its firmware/ directory.")
endif()

set(EXTRA_COMPONENT_DIRS "${FIFAWATCH_FIRMWARE}/components")

# sdkconfig.defaults (primary; must exist as a single file path)
if(EXISTS "${CMAKE_CURRENT_LIST_DIR}/sdkconfig.defaults")
    set(_GB_SDKCONFIG_PRIMARY "${CMAKE_CURRENT_LIST_DIR}/sdkconfig.defaults")
else()
    set(_GB_SDKCONFIG_PRIMARY "${FIFAWATCH_FIRMWARE}/sdkconfig.defaults")
endif()

if(NOT EXISTS "${_GB_SDKCONFIG_PRIMARY}")
    message(FATAL_ERROR
        "sdkconfig.defaults not found at:\n"
        "  ${CMAKE_CURRENT_LIST_DIR}/sdkconfig.defaults\n"
        "  ${FIFAWATCH_FIRMWARE}/sdkconfig.defaults\n"
        "Copy from FIFAWatch or pull latest GrammarBuddy firmware/.")
endif()

set(SDKCONFIG_DEFAULTS "${_GB_SDKCONFIG_PRIMARY}")

# Only GrammarBuddy-local overrides (do not pull FIFAWatch sdkconfig.defaults.local)
if(EXISTS "${CMAKE_CURRENT_LIST_DIR}/sdkconfig.defaults.local")
    list(APPEND SDKCONFIG_DEFAULTS "${CMAKE_CURRENT_LIST_DIR}/sdkconfig.defaults.local")
endif()

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(GrammarBuddy-StopWatch)
