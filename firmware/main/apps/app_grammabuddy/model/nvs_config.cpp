#include "nvs_config.h"

#include <nvs.h>
#include <nvs_flash.h>

namespace grammarbuddy {

bool load_ws_url(char* buffer, size_t buffer_size)
{
    if (buffer == nullptr || buffer_size == 0) {
        return false;
    }

    nvs_handle_t handle;
    if (nvs_open("grammabuddy", NVS_READONLY, &handle) != ESP_OK) {
        return false;
    }

    size_t required = buffer_size;
    esp_err_t err   = nvs_get_str(handle, "ws_url", buffer, &required);
    nvs_close(handle);
    return err == ESP_OK && required > 1;
}

}  // namespace grammarbuddy
