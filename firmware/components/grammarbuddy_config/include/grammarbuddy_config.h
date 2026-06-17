#pragma once

#include <cJSON.h>
#include <cstddef>
#include <cstdint>

#ifdef __cplusplus
extern "C" {
#endif

/** Default WebSocket URL when NVS is empty. */
#define GRAMMARBUDDY_DEFAULT_WS_URL "ws://192.168.1.100:8000/ws/session"

bool grammarbuddy_config_load_ws_url(char* buffer, size_t buffer_size);

/** Load host/port; fills defaults when keys are missing. Returns true if ws_url existed. */
bool grammarbuddy_config_load_server(char* host, size_t host_size, uint16_t* port);

bool grammarbuddy_config_save_server(const char* host, uint16_t port);

/** Add gb_server_host / gb_server_port to captive-portal JSON. */
void grammarbuddy_config_append_wifi_json(cJSON* json);

/** Parse gb_server_host / gb_server_port from POST body; no-op if fields absent. */
bool grammarbuddy_config_save_wifi_json(cJSON* json, char* err, size_t err_len);

#ifdef __cplusplus
}
#endif
