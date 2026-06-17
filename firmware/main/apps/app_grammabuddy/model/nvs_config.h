#pragma once

#include <grammarbuddy_config.h>
#include <cstddef>

namespace grammarbuddy {

constexpr const char* kDefaultWsUrl = GRAMMARBUDDY_DEFAULT_WS_URL;

inline bool load_ws_url(char* buffer, size_t buffer_size)
{
    return grammarbuddy_config_load_ws_url(buffer, buffer_size);
}

}  // namespace grammarbuddy
