/*
 * SPDX-FileCopyrightText: 2026 GrammarBuddy
 * Platform apps from M5_Stack_FIFAWatch (Launcher / Setup / ChroneCore).
 */
#pragma once

#include <memory>

#include <apps/app_chrone_core/app_chrone_core.h>
#include <apps/app_launcher/app_launcher.h>
#include <apps/app_setup/app_setup.h>
#include <mooncake.h>

inline void install_platform_apps()
{
    mooncake::GetMooncake().installApp(std::make_unique<AppLauncher>());
    mooncake::GetMooncake().installApp(std::make_unique<AppSetup>());
    mooncake::GetMooncake().installApp(std::make_unique<AppChroneCore>());
}
