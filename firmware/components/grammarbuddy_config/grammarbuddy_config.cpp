#include "grammarbuddy_config.h"

#include <sdkconfig.h>

#include <cctype>
#include <cstdio>
#include <cstring>

#include <nvs.h>

namespace {

constexpr const char* kNvsNamespace = "grammabuddy";
constexpr const char* kKeyWsUrl     = "ws_url";
constexpr const char* kKeyHost      = "server_host";
constexpr const char* kKeyPort      = "server_port";

const char* default_host()
{
#if CONFIG_GRAMMARBUDDY_WIFI_SERVER_CONFIG
    return CONFIG_GRAMMARBUDDY_DEFAULT_SERVER_HOST;
#else
    return "192.168.1.100";
#endif
}

uint16_t default_port()
{
#if CONFIG_GRAMMARBUDDY_WIFI_SERVER_CONFIG
    return static_cast<uint16_t>(CONFIG_GRAMMARBUDDY_DEFAULT_SERVER_PORT);
#else
    return 8000;
#endif
}

bool is_valid_host(const char* host)
{
    if (host == nullptr || host[0] == '\0') {
        return false;
    }
    size_t len = std::strlen(host);
    if (len >= 128) {
        return false;
    }
    for (size_t i = 0; i < len; ++i) {
        const unsigned char c = static_cast<unsigned char>(host[i]);
        if (std::isspace(c)) {
            return false;
        }
    }
    return true;
}

bool compose_ws_url(const char* host, uint16_t port, char* out, size_t out_size)
{
    if (out == nullptr || out_size == 0) {
        return false;
    }
    const int n = std::snprintf(out, out_size, "ws://%s:%u/ws/session", host, static_cast<unsigned>(port));
    return n > 0 && static_cast<size_t>(n) < out_size;
}

void apply_defaults(char* host, size_t host_size, uint16_t* port)
{
    if (host != nullptr && host_size > 0 && host[0] == '\0') {
        std::strncpy(host, default_host(), host_size - 1);
        host[host_size - 1] = '\0';
    }
    if (port != nullptr && *port == 0) {
        *port = default_port();
    }
}

}  // namespace

extern "C" {

bool grammarbuddy_config_load_ws_url(char* buffer, size_t buffer_size)
{
    if (buffer == nullptr || buffer_size == 0) {
        return false;
    }

    nvs_handle_t handle;
    if (nvs_open(kNvsNamespace, NVS_READONLY, &handle) == ESP_OK) {
        size_t required = buffer_size;
        if (nvs_get_str(handle, kKeyWsUrl, buffer, &required) == ESP_OK && required > 1) {
            nvs_close(handle);
            return true;
        }
        nvs_close(handle);
    }

    char host[128] = {};
    uint16_t port  = 0;
    grammarbuddy_config_load_server(host, sizeof(host), &port);
    compose_ws_url(host, port, buffer, buffer_size);
    return false;
}

bool grammarbuddy_config_load_server(char* host, size_t host_size, uint16_t* port)
{
    if (host == nullptr || host_size == 0 || port == nullptr) {
        return false;
    }

    host[0] = '\0';
    *port   = 0;

    nvs_handle_t handle;
    if (nvs_open(kNvsNamespace, NVS_READONLY, &handle) != ESP_OK) {
        apply_defaults(host, host_size, port);
        return false;
    }

    size_t host_len = host_size;
    const esp_err_t host_err = nvs_get_str(handle, kKeyHost, host, &host_len);

    uint16_t stored_port = 0;
    const esp_err_t port_err = nvs_get_u16(handle, kKeyPort, &stored_port);
    if (port_err == ESP_OK && stored_port > 0) {
        *port = stored_port;
    }

    nvs_close(handle);

    if (host_err != ESP_OK || host[0] == '\0') {
        host[0] = '\0';
    }

    apply_defaults(host, host_size, port);
    return host_err == ESP_OK || port_err == ESP_OK;
}

bool grammarbuddy_config_save_server(const char* host, uint16_t port)
{
    if (!is_valid_host(host) || port == 0) {
        return false;
    }

    char ws_url[192] = {};
    if (!compose_ws_url(host, port, ws_url, sizeof(ws_url))) {
        return false;
    }

    nvs_handle_t handle;
    if (nvs_open(kNvsNamespace, NVS_READWRITE, &handle) != ESP_OK) {
        return false;
    }

    esp_err_t err = nvs_set_str(handle, kKeyHost, host);
    if (err == ESP_OK) {
        err = nvs_set_u16(handle, kKeyPort, port);
    }
    if (err == ESP_OK) {
        err = nvs_set_str(handle, kKeyWsUrl, ws_url);
    }
    if (err == ESP_OK) {
        err = nvs_commit(handle);
    }
    nvs_close(handle);
    return err == ESP_OK;
}

void grammarbuddy_config_append_wifi_json(cJSON* json)
{
#if !CONFIG_GRAMMARBUDDY_WIFI_SERVER_CONFIG
    (void)json;
    return;
#endif
    if (json == nullptr) {
        return;
    }

    char host[128] = {};
    uint16_t port  = 0;
    grammarbuddy_config_load_server(host, sizeof(host), &port);
    cJSON_AddStringToObject(json, "gb_server_host", host);
    cJSON_AddNumberToObject(json, "gb_server_port", port);
}

bool grammarbuddy_config_save_wifi_json(cJSON* json, char* err, size_t err_len)
{
#if !CONFIG_GRAMMARBUDDY_WIFI_SERVER_CONFIG
    (void)json;
    (void)err;
    (void)err_len;
    return true;
#endif
    if (json == nullptr) {
        return true;
    }

    cJSON* host_item = cJSON_GetObjectItem(json, "gb_server_host");
    cJSON* port_item = cJSON_GetObjectItem(json, "gb_server_port");
    if (!cJSON_IsString(host_item) || host_item->valuestring == nullptr) {
        return true;
    }

    const char* host = host_item->valuestring;
    if (host[0] == '\0') {
        return true;
    }

    uint16_t port = default_port();
    if (cJSON_IsNumber(port_item)) {
        const int p = port_item->valueint;
        if (p > 0 && p <= 65535) {
            port = static_cast<uint16_t>(p);
        }
    }

    if (!is_valid_host(host)) {
        if (err && err_len > 0) {
            std::snprintf(err, err_len, "Invalid server address");
        }
        return false;
    }

    if (!grammarbuddy_config_save_server(host, port)) {
        if (err && err_len > 0) {
            std::snprintf(err, err_len, "Failed to save server settings");
        }
        return false;
    }
    return true;
}

}  // extern "C"
