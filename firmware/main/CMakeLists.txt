# Pull shared StopWatch platform sources from M5_Stack_FIFAWatch
if(DEFINED ENV{FIFAWATCH_FIRMWARE})
    set(FIFAWATCH_FIRMWARE "$ENV{FIFAWATCH_FIRMWARE}")
else()
    get_filename_component(FIFAWATCH_FIRMWARE "${CMAKE_CURRENT_LIST_DIR}/../../../M5_Stack_FIFAWatch/firmware" ABSOLUTE)
endif()

set(FIFAWATCH_MAIN "${FIFAWATCH_FIRMWARE}/main")

file(GLOB_RECURSE PLATFORM_SRCS
    "${FIFAWATCH_MAIN}/hal/*.c"
    "${FIFAWATCH_MAIN}/hal/*.cc"
    "${FIFAWATCH_MAIN}/hal/*.cpp"
    "${FIFAWATCH_MAIN}/assets/*.c"
    "${FIFAWATCH_MAIN}/assets/*.cc"
    "${FIFAWATCH_MAIN}/assets/*.cpp"
    "${FIFAWATCH_MAIN}/apps/app_launcher/*.c"
    "${FIFAWATCH_MAIN}/apps/app_launcher/*.cc"
    "${FIFAWATCH_MAIN}/apps/app_launcher/*.cpp"
    "${FIFAWATCH_MAIN}/apps/app_setup/*.c"
    "${FIFAWATCH_MAIN}/apps/app_setup/*.cc"
    "${FIFAWATCH_MAIN}/apps/app_setup/*.cpp"
    "${FIFAWATCH_MAIN}/apps/app_chrone_core/*.c"
    "${FIFAWATCH_MAIN}/apps/app_chrone_core/*.cc"
    "${FIFAWATCH_MAIN}/apps/app_chrone_core/*.cpp"
    "${FIFAWATCH_MAIN}/apps/common/key_manager/*.c"
    "${FIFAWATCH_MAIN}/apps/common/key_manager/*.cc"
    "${FIFAWATCH_MAIN}/apps/common/key_manager/*.cpp"
    "${FIFAWATCH_MAIN}/apps/common/status_bar/*.c"
    "${FIFAWATCH_MAIN}/apps/common/status_bar/*.cc"
    "${FIFAWATCH_MAIN}/apps/common/status_bar/*.cpp"
    "${FIFAWATCH_MAIN}/apps/common/arc_top_clock/*.c"
    "${FIFAWATCH_MAIN}/apps/common/arc_top_clock/*.cc"
    "${FIFAWATCH_MAIN}/apps/common/arc_top_clock/*.cpp"
    "${FIFAWATCH_MAIN}/apps/common/audio/*.c"
    "${FIFAWATCH_MAIN}/apps/common/audio/*.cc"
    "${FIFAWATCH_MAIN}/apps/common/audio/*.cpp"
)

# Explicit extras from FIFAWatch main/CMakeLists.txt (non-glob)
list(APPEND PLATFORM_SRCS
    "${FIFAWATCH_MAIN}/apps/app_setup/workers/wifi.cpp"
    # ChroneCore still references fifawatch kickoff alarm (no FIFAWatch app UI)
    "${FIFAWATCH_MAIN}/apps/app_fifawatch/model/match_alarm.cpp"
    "${FIFAWATCH_MAIN}/apps/app_fifawatch/model/time_format.cpp"
)

file(GLOB_RECURSE GRAMMAR_SRCS
    "apps/app_grammabuddy/*.c"
    "apps/app_grammabuddy/*.cc"
    "apps/app_grammabuddy/*.cpp"
)

set(PLATFORM_INCS
    "${FIFAWATCH_MAIN}"
    "${FIFAWATCH_MAIN}/apps/app_chrone_core"
    "${FIFAWATCH_MAIN}/apps/app_fifawatch"
    "${FIFAWATCH_MAIN}/apps/common"
)

idf_component_register(
    SRCS
        "main.cpp"
        ${PLATFORM_SRCS}
        ${GRAMMAR_SRCS}
    INCLUDE_DIRS
        "."
        ${PLATFORM_INCS}
    REQUIRES
        mooncake
        mooncake_log
        smooth_ui_toolkit
        lvgl
        M5GFX
        M5IOE1
        M5PM1
        BMI270_BMM150_Sensor
        ArduinoJson
        espressif__i2c_bus
        espressif__esp_codec_dev
        espressif__esp-dsp
        esp_wifi
        esp_netif
        esp_event
        nvs_flash
        lwip
        fatfs
        chrone_weather
        esp_wifi_connect
        esp_http_client
        json
        espressif__esp_websocket_client
    EMBED_FILES
        "${FIFAWATCH_MAIN}/assets/sfx/boot_sfx.bin"
    EMBED_TXTFILES
        "${FIFAWATCH_MAIN}/hal/utils/config_ap/assets/badge_config_ap.html"
)
