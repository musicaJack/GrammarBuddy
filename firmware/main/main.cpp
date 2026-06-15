/*
 * GrammarBuddy StopWatch — Mooncake entry
 * Platform (HAL, Launcher, WiFi, Settings) sourced from M5_Stack_FIFAWatch.
 */
#include <apps/app_grammabuddy/app_grammabuddy.h>
#include <apps/apps_platform.h>
#include <hal/hal.h>
#include <mooncake.h>
#include <mooncake_log.h>
#include <smooth_ui_toolkit.hpp>
#include <uitk/short_namespace.hpp>

using namespace mooncake;
using namespace smooth_ui_toolkit;

extern "C" void app_main(void)
{
    mclog::set_level(mclog::level_info);
    mclog::set_time_format(mclog::time_format_unix_milliseconds);

    GetHAL().init();

    ui_hal::on_delay([](uint32_t ms) { GetHAL().delay(ms); });
    ui_hal::on_get_tick([]() { return GetHAL().millis(); });

    install_platform_apps();

    GetMooncake().installApp(std::make_unique<AppGrammarBuddy>());

    while (1) {
        GetHAL().feedTheDog();
        GetMooncake().update();
    }
}
