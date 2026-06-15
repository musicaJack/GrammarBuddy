#pragma once

#include <cstddef>

namespace grammarbuddy {

constexpr const char* kDefaultWsUrl = "ws://192.168.1.100:8000/ws/session";

/** Load ws_url from NVS namespace "grammabuddy". Returns false if missing. */
bool load_ws_url(char* buffer, size_t buffer_size);

}  // namespace grammarbuddy
