#include "wifi_configuration_ap.h"
#include <cstdio>
#include <cstring>
#include <memory>
#include <freertos/FreeRTOS.h>
#include <freertos/event_groups.h>
#include <esp_err.h>
#include <esp_event.h>
#include <esp_wifi.h>
#include <esp_log.h>
#include <esp_mac.h>
#include <esp_netif.h>
#include <lwip/ip_addr.h>
#include <nvs.h>
#include <nvs_flash.h>
#include <cJSON.h>
#if !CONFIG_IDF_TARGET_ESP32P4
#include <esp_smartconfig.h>
#endif
#include "ssid_manager.h"
#include "sdkconfig.h"
#include "grammarbuddy_config.h"
#if CONFIG_CHRONECORE_WEATHER_CONFIG
#include "weather_city_list.h"
#include "location_tz_list.h"
#define WIFI_CFG_DEFAULT_WEATHER_CITY CONFIG_CHRONECORE_WEATHER_DEFAULT_CITY
#endif

#define TAG "WifiConfigurationAp"

#define WIFI_CONNECTED_BIT BIT0
#define WIFI_FAIL_BIT      BIT1

static void trim_trailing_slash(char *url)
{
    if (!url) {
        return;
    }
    size_t len = strlen(url);
    while (len > 0 && url[len - 1] == '/') {
        url[--len] = '\0';
    }
}

static void save_baked_fifawatch_api_to_nvs(void)
{
#if CONFIG_FIFAWATCH_USE_BAKED_API
    const char *url = CONFIG_FIFAWATCH_BAKED_API_BASE;
    if (!url || url[0] == '\0') {
        ESP_LOGW(TAG, "FIFAWatch baked API enabled but URL is empty");
        return;
    }

    char normalized[128];
    snprintf(normalized, sizeof(normalized), "%s", url);
    trim_trailing_slash(normalized);

    nvs_handle_t nvs_f;
    if (nvs_open("fifawatch", NVS_READWRITE, &nvs_f) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to open fifawatch NVS for baked API");
        return;
    }

    esp_err_t err = nvs_set_str(nvs_f, "api_base_url", normalized);
    if (err == ESP_OK) {
        err = nvs_commit(nvs_f);
    }
    nvs_close(nvs_f);

    if (err == ESP_OK) {
        ESP_LOGI(TAG, "FIFAWatch API base saved (baked, hidden)");
    } else {
        ESP_LOGE(TAG, "Failed to save baked FIFAWatch API: %s", esp_err_to_name(err));
    }
#endif
}

#if CONFIG_CHRONECORE_WEATHER_CONFIG
static void read_saved_location(char *country, size_t country_len, char *city, size_t city_len, char *tz, size_t tz_len)
{
    if (country && country_len > 0) {
        country[0] = '\0';
    }
    if (city && city_len > 0) {
        city[0] = '\0';
    }
    if (tz && tz_len > 0) {
        tz[0] = '\0';
    }

    nvs_handle_t nvs_sys;
    if (nvs_open("system", NVS_READONLY, &nvs_sys) == ESP_OK) {
        if (country && country_len > 0) {
            size_t len = country_len;
            nvs_get_str(nvs_sys, LOCATION_NVS_KEY_COUNTRY, country, &len);
        }
        if (city && city_len > 0) {
            size_t len = city_len;
            if (nvs_get_str(nvs_sys, LOCATION_NVS_KEY_CITY, city, &len) != ESP_OK) {
                city[0] = '\0';
            }
        }
        if (tz && tz_len > 0) {
            size_t len = tz_len;
            nvs_get_str(nvs_sys, "tz", tz, &len);
        }
        nvs_close(nvs_sys);
    }

    if (city && city[0] == '\0') {
        nvs_handle_t nvs_w;
        if (nvs_open("weather", NVS_READONLY, &nvs_w) == ESP_OK) {
            size_t len = city_len;
            if (nvs_get_str(nvs_w, WEATHER_NVS_KEY_LOCATION, city, &len) != ESP_OK) {
                city[0] = '\0';
            }
            nvs_close(nvs_w);
        }
    }

    if (country && country[0] == '\0') {
        snprintf(country, country_len, "%s", "CN");
    }
    if (city && city[0] == '\0' && weather_city_is_valid_id(WIFI_CFG_DEFAULT_WEATHER_CITY)) {
        snprintf(city, city_len, "%s", WIFI_CFG_DEFAULT_WEATHER_CITY);
    }
    if (tz && tz[0] == '\0') {
        location_selection_t sel;
        if (location_resolve(country, city, &sel) && sel.tz) {
            snprintf(tz, tz_len, "%s", sel.tz);
        } else {
            snprintf(tz, tz_len, "%s", "CST-8");
        }
    }
}

static void append_location_json(cJSON *json)
{
    char country[8] = {0};
    char city[64] = {0};
    char tz[64] = {0};
    read_saved_location(country, sizeof(country), city, sizeof(city), tz, sizeof(tz));

    cJSON_AddStringToObject(json, "location_country", country);
    cJSON_AddStringToObject(json, "location_city", city);
    cJSON_AddStringToObject(json, "timezone", tz);
    cJSON_AddStringToObject(json, "weather_location", city);

    cJSON *countries = cJSON_CreateArray();
    if (!countries) {
        return;
    }

    for (size_t ci = 0; ci < location_country_count(); ++ci) {
        const location_country_entry_t *entry = location_country_get(ci);
        if (!entry) {
            continue;
        }
        cJSON *cobj = cJSON_CreateObject();
        if (!cobj) {
            continue;
        }
        cJSON_AddStringToObject(cobj, "id", entry->id);
        cJSON_AddStringToObject(cobj, "name_en", entry->name_en);
        cJSON_AddStringToObject(cobj, "name_zh", entry->name_zh);

        cJSON *cities = cJSON_CreateArray();
        if (cities) {
            const size_t city_count = location_city_count_for_country(entry->id);
            for (size_t i = 0; i < city_count; ++i) {
                location_city_entry_t city_entry;
                if (!location_city_get(entry->id, i, &city_entry)) {
                    continue;
                }
                cJSON *city_obj = cJSON_CreateObject();
                if (!city_obj) {
                    continue;
                }
                cJSON_AddStringToObject(city_obj, "id", city_entry.id);
                cJSON_AddStringToObject(city_obj, "name_en", city_entry.name_en);
                cJSON_AddStringToObject(city_obj, "name_zh", city_entry.name_zh);
                cJSON_AddStringToObject(city_obj, "tz", city_entry.tz);
                cJSON_AddItemToArray(cities, city_obj);
            }
            cJSON_AddItemToObject(cobj, "cities", cities);
        }
        cJSON_AddItemToArray(countries, cobj);
    }
    cJSON_AddItemToObject(json, "countries", countries);
}

static bool save_location_from_json(cJSON *json, char *err, size_t err_len)
{
    const char *country_id = NULL;
    const char *city_id = NULL;

    cJSON *country = cJSON_GetObjectItem(json, "location_country");
    cJSON *city = cJSON_GetObjectItem(json, "location_city");
    if (cJSON_IsString(country) && country->valuestring && cJSON_IsString(city) && city->valuestring) {
        country_id = country->valuestring;
        city_id = city->valuestring;
    } else {
        cJSON *legacy = cJSON_GetObjectItem(json, "weather_location");
        if (cJSON_IsString(legacy) && legacy->valuestring && legacy->valuestring[0] != '\0') {
            country_id = "CN";
            city_id = legacy->valuestring;
        }
    }

    if (!country_id || !city_id || city_id[0] == '\0') {
        if (err && err_len > 0) {
            snprintf(err, err_len, "Country and city are required");
        }
        return false;
    }

    location_selection_t sel;
    if (!location_resolve(country_id, city_id, &sel) || !sel.tz) {
        if (err && err_len > 0) {
            snprintf(err, err_len, "Invalid country or city");
        }
        return false;
    }

    nvs_handle_t nvs_sys;
    if (nvs_open("system", NVS_READWRITE, &nvs_sys) != ESP_OK) {
        if (err && err_len > 0) {
            snprintf(err, err_len, "Failed to open system NVS");
        }
        return false;
    }

    esp_err_t terr = nvs_set_str(nvs_sys, "tz", sel.tz);
    if (terr == ESP_OK) {
        terr = nvs_set_str(nvs_sys, LOCATION_NVS_KEY_COUNTRY, sel.country_id);
    }
    if (terr == ESP_OK) {
        terr = nvs_set_str(nvs_sys, LOCATION_NVS_KEY_CITY, sel.city_id);
    }
    if (terr == ESP_OK) {
        terr = nvs_commit(nvs_sys);
    }
    nvs_close(nvs_sys);
    if (terr != ESP_OK) {
        if (err && err_len > 0) {
            snprintf(err, err_len, "Failed to save timezone");
        }
        return false;
    }

    nvs_handle_t nvs_w;
    if (nvs_open("weather", NVS_READWRITE, &nvs_w) == ESP_OK) {
        if (sel.weather_id && sel.weather_id[0] != '\0') {
            nvs_set_str(nvs_w, WEATHER_NVS_KEY_LOCATION, sel.weather_id);
        } else {
            nvs_erase_key(nvs_w, WEATHER_NVS_KEY_LOCATION);
        }
        nvs_commit(nvs_w);
        nvs_close(nvs_w);
    }

    ESP_LOGI(TAG, "Saved location %s/%s tz=%s weather=%s", sel.country_id, sel.city_id, sel.tz,
             sel.weather_id ? sel.weather_id : "(none)");
    return true;
}
#endif

extern const char index_html_start[] asm("_binary_wifi_configuration_html_start");
extern const char done_html_start[] asm("_binary_wifi_configuration_done_html_start");

WifiConfigurationAp::WifiConfigurationAp()
{
    event_group_ = xEventGroupCreate();
    language_ = "zh-CN";
    sleep_mode_ = false;
    instance_any_id_ = nullptr;
    instance_got_ip_ = nullptr;
    max_tx_power_ = 0;
    remember_bssid_ = false;
}

std::vector<wifi_ap_record_t> WifiConfigurationAp::GetAccessPoints()
{
    std::lock_guard<std::mutex> lock(mutex_);
    return ap_records_;
}   

WifiConfigurationAp::~WifiConfigurationAp()
{
    Stop();
    if (event_group_) {
        vEventGroupDelete(event_group_);
        event_group_ = nullptr;
    }
}

void WifiConfigurationAp::SetLanguage(const std::string &&language)
{
    language_ = language;
}

void WifiConfigurationAp::SetLanguage(const std::string &language)
{
    language_ = language;
}

void WifiConfigurationAp::SetSsidPrefix(const std::string &&ssid_prefix)
{
    ssid_prefix_ = ssid_prefix;
}

void WifiConfigurationAp::SetSsidPrefix(const std::string &ssid_prefix)
{
    ssid_prefix_ = ssid_prefix;
}

void WifiConfigurationAp::Start()
{
    // Register event handlers
    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT,
                                                        ESP_EVENT_ANY_ID,
                                                        &WifiConfigurationAp::WifiEventHandler,
                                                        this,
                                                        &instance_any_id_));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT,
                                                        IP_EVENT_STA_GOT_IP,
                                                        &WifiConfigurationAp::IpEventHandler,
                                                        this,
                                                        &instance_got_ip_));

    StartAccessPoint();
    StartWebServer();
    
    // Start scan immediately
    esp_wifi_scan_start(nullptr, false);
    // Setup periodic WiFi scan timer
    esp_timer_create_args_t timer_args = {
        .callback = [](void* arg) {
            auto* self = static_cast<WifiConfigurationAp*>(arg);
            if (!self->is_connecting_) {
                esp_wifi_scan_start(nullptr, false);
            }
        },
        .arg = this,
        .dispatch_method = ESP_TIMER_TASK,
        .name = "wifi_scan_timer",
        .skip_unhandled_events = true
    };
    ESP_ERROR_CHECK(esp_timer_create(&timer_args, &scan_timer_));
}

std::string WifiConfigurationAp::GetSsid()
{
    // Get MAC and use it to generate a unique SSID
    uint8_t mac[6];
#if CONFIG_IDF_TARGET_ESP32P4
    esp_wifi_get_mac(WIFI_IF_AP, mac);
#else
    ESP_ERROR_CHECK(esp_read_mac(mac, ESP_MAC_WIFI_SOFTAP));
#endif
    char ssid[32];
    snprintf(ssid, sizeof(ssid), "%s-%02X%02X", ssid_prefix_.c_str(), mac[4], mac[5]);
    return std::string(ssid);
}

std::string WifiConfigurationAp::GetWebServerUrl()
{
    // http://192.168.4.1
    return "http://192.168.4.1";
}

void WifiConfigurationAp::StartAccessPoint()
{
    // Note: esp_netif_init() and esp_wifi_init() should be called once before calling this method
    // WiFi driver is initialized by WifiManager::Initialize() and kept alive
    
    // Create the default WiFi AP interface
    ap_netif_ = esp_netif_create_default_wifi_ap();

    // Set the router IP address to 192.168.4.1
    esp_netif_ip_info_t ip_info;
    IP4_ADDR(&ip_info.ip, 192, 168, 4, 1);
    IP4_ADDR(&ip_info.gw, 192, 168, 4, 1);
    IP4_ADDR(&ip_info.netmask, 255, 255, 255, 0);
    esp_netif_dhcps_stop(ap_netif_);
    esp_netif_set_ip_info(ap_netif_, &ip_info);
    esp_netif_dhcps_start(ap_netif_);

    // Start the DNS server
    dns_server_ = std::make_unique<DnsServer>();
    dns_server_->Start(ip_info.gw);

    // Get the SSID
    std::string ssid = GetSsid();

    // Set the WiFi configuration
    wifi_config_t wifi_config = {};
    strcpy((char *)wifi_config.ap.ssid, ssid.c_str());
    wifi_config.ap.ssid_len = ssid.length();
    wifi_config.ap.max_connection = 4;
    wifi_config.ap.authmode = WIFI_AUTH_OPEN;

    // Start the WiFi Access Point
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_APSTA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));
    ESP_ERROR_CHECK(esp_wifi_start());

#ifdef CONFIG_SOC_WIFI_SUPPORT_5G
    ESP_ERROR_CHECK(esp_wifi_set_band_mode(WIFI_BAND_MODE_AUTO));
#else
    ESP_ERROR_CHECK(esp_wifi_set_band_mode(WIFI_BAND_MODE_2G_ONLY));
#endif

    ESP_LOGI(TAG, "Access Point started with SSID %s", ssid.c_str());

    // 加载高级配置
    nvs_handle_t nvs;
    esp_err_t err = nvs_open("wifi", NVS_READONLY, &nvs);
    if (err == ESP_OK) {
        // 读取OTA URL
        char ota_url[256] = {0};
        size_t ota_url_size = sizeof(ota_url);
        err = nvs_get_str(nvs, "ota_url", ota_url, &ota_url_size);
        if (err == ESP_OK) {
            ota_url_ = ota_url;
        }

        // 读取WiFi功率
        err = nvs_get_i8(nvs, "max_tx_power", &max_tx_power_);
        if (err == ESP_OK) {
            ESP_LOGI(TAG, "WiFi max tx power from NVS: %d", max_tx_power_);
            ESP_ERROR_CHECK(esp_wifi_set_max_tx_power(max_tx_power_));
        } else {
            esp_wifi_get_max_tx_power(&max_tx_power_);
        }

        // 读取BSSID记忆设置
        uint8_t remember_bssid = 0;
        err = nvs_get_u8(nvs, "remember_bssid", &remember_bssid);
        if (err == ESP_OK) {
            remember_bssid_ = remember_bssid != 0;
        } else {
            remember_bssid_ = false; // 默认值
        }

        // 读取睡眠模式设置
        uint8_t sleep_mode = 0;
        err = nvs_get_u8(nvs, "sleep_mode", &sleep_mode);
        if (err == ESP_OK) {
            sleep_mode_ = sleep_mode != 0;
        } else {
            sleep_mode_ = true; // 默认值
        }

        nvs_close(nvs);
    }
}

void WifiConfigurationAp::StartWebServer()
{
    // Start the web server
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.max_uri_handlers = 24;
    config.uri_match_fn = httpd_uri_match_wildcard;
    // 5G Network takes longer to connect
    config.recv_wait_timeout = 15;
    config.send_wait_timeout = 15;
    ESP_ERROR_CHECK(httpd_start(&server_, &config));

    // Register the index.html file
    httpd_uri_t index_html = {
        .uri = "/",
        .method = HTTP_GET,
        .handler = [](httpd_req_t *req) -> esp_err_t {
            httpd_resp_set_hdr(req, "Connection", "close");
            httpd_resp_send(req, index_html_start, strlen(index_html_start));
            return ESP_OK;
        },
        .user_ctx = NULL
    };
    ESP_ERROR_CHECK(httpd_register_uri_handler(server_, &index_html));

    // Register the /saved/list URI
    httpd_uri_t saved_list = {
        .uri = "/saved/list",
        .method = HTTP_GET,
        .handler = [](httpd_req_t *req) -> esp_err_t {
            auto ssid_list = SsidManager::GetInstance().GetSsidList();
            std::string json_str = "[";
            for (const auto& ssid : ssid_list) {
                json_str += "\"" + ssid.ssid + "\",";
            }
            if (json_str.length() > 1) {
                json_str.pop_back(); // Remove the last comma
            }
            json_str += "]";
            httpd_resp_set_type(req, "application/json");
            httpd_resp_set_hdr(req, "Connection", "close");
            httpd_resp_send(req, json_str.c_str(), HTTPD_RESP_USE_STRLEN);
            return ESP_OK;
        },
        .user_ctx = NULL
    };
    ESP_ERROR_CHECK(httpd_register_uri_handler(server_, &saved_list));

    // Register the /saved/set_default URI
    httpd_uri_t saved_set_default = {
        .uri = "/saved/set_default",
        .method = HTTP_GET,
        .handler = [](httpd_req_t *req) -> esp_err_t {
            std::string uri = req->uri;
            auto pos = uri.find("?index=");
            if (pos != std::string::npos) {
                int index = -1;
                sscanf(&req->uri[pos+7], "%d", &index);
                ESP_LOGI(TAG, "Set default item %d", index);
                SsidManager::GetInstance().SetDefaultSsid(index);
            }
            // send {}
            httpd_resp_set_type(req, "application/json");
            httpd_resp_set_hdr(req, "Connection", "close");
            httpd_resp_send(req, "{}", HTTPD_RESP_USE_STRLEN);
            return ESP_OK;
        },
        .user_ctx = NULL
    };
    ESP_ERROR_CHECK(httpd_register_uri_handler(server_, &saved_set_default));

    // Register the /saved/delete URI
    httpd_uri_t saved_delete = {
        .uri = "/saved/delete",
        .method = HTTP_GET,
        .handler = [](httpd_req_t *req) -> esp_err_t {
            std::string uri = req->uri;
            auto pos = uri.find("?index=");
            if (pos != std::string::npos) {
                int index = -1;
                sscanf(&req->uri[pos+7], "%d", &index);
                ESP_LOGI(TAG, "Delete saved list item %d", index);
                SsidManager::GetInstance().RemoveSsid(index);
            }
            // send {}
            httpd_resp_set_type(req, "application/json");
            httpd_resp_set_hdr(req, "Connection", "close");
            httpd_resp_send(req, "{}", HTTPD_RESP_USE_STRLEN);
            return ESP_OK;
        },
        .user_ctx = NULL
    };
    ESP_ERROR_CHECK(httpd_register_uri_handler(server_, &saved_delete));

    // Register the /scan URI
    httpd_uri_t scan = {
        .uri = "/scan",
        .method = HTTP_GET,
        .handler = [](httpd_req_t *req) -> esp_err_t {
            auto *this_ = static_cast<WifiConfigurationAp *>(req->user_ctx);
            std::lock_guard<std::mutex> lock(this_->mutex_);

            // Check if 5G is supported
            bool support_5g = false;
#ifdef CONFIG_SOC_WIFI_SUPPORT_5G
            support_5g = true;
#endif

            // Send the scan results as JSON
            httpd_resp_set_type(req, "application/json");
            httpd_resp_set_hdr(req, "Connection", "close");
            httpd_resp_sendstr_chunk(req, "{\"support_5g\":");
            httpd_resp_sendstr_chunk(req, support_5g ? "true" : "false");
            httpd_resp_sendstr_chunk(req, ",\"aps\":[");
            for (int i = 0; i < this_->ap_records_.size(); i++) {
                ESP_LOGI(TAG, "SSID: %s, RSSI: %d, Authmode: %d",
                    (char *)this_->ap_records_[i].ssid, this_->ap_records_[i].rssi, this_->ap_records_[i].authmode);
                char buf[128];
                snprintf(buf, sizeof(buf), "{\"ssid\":\"%s\",\"rssi\":%d,\"authmode\":%d}",
                    (char *)this_->ap_records_[i].ssid, this_->ap_records_[i].rssi, this_->ap_records_[i].authmode);
                httpd_resp_sendstr_chunk(req, buf);
                if (i < this_->ap_records_.size() - 1) {
                    httpd_resp_sendstr_chunk(req, ",");
                }
            }
            httpd_resp_sendstr_chunk(req, "]}");
            httpd_resp_sendstr_chunk(req, NULL);
            return ESP_OK;
        },
        .user_ctx = this
    };
    ESP_ERROR_CHECK(httpd_register_uri_handler(server_, &scan));

    // Register the form submission
    httpd_uri_t form_submit = {
        .uri = "/submit",
        .method = HTTP_POST,
        .handler = [](httpd_req_t *req) -> esp_err_t {
            char *buf;
            size_t buf_len = req->content_len;
            if (buf_len > 1024) { // 限制最大请求体大小
                httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Payload too large");
                return ESP_FAIL;
            }

            buf = (char *)malloc(buf_len + 1);
            if (!buf) {
                httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to allocate memory");
                return ESP_FAIL;
            }

            int ret = httpd_req_recv(req, buf, buf_len);
            if (ret <= 0) {
                free(buf);
                if (ret == HTTPD_SOCK_ERR_TIMEOUT) {
                    httpd_resp_send_408(req);
                } else {
                    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Failed to receive request");
                }
                return ESP_FAIL;
            }
            buf[ret] = '\0';

            // 解析 JSON 数据
            cJSON *json = cJSON_Parse(buf);
            free(buf);
            if (!json) {
                httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid JSON");
                return ESP_FAIL;
            }

            cJSON *ssid_item = cJSON_GetObjectItemCaseSensitive(json, "ssid");
            cJSON *password_item = cJSON_GetObjectItemCaseSensitive(json, "password");

            if (!cJSON_IsString(ssid_item) || (ssid_item->valuestring == NULL) || (strlen(ssid_item->valuestring) >= 33)) {
                cJSON_Delete(json);
                httpd_resp_send(req, "{\"success\":false,\"error\":\"Invalid SSID\"}", HTTPD_RESP_USE_STRLEN);
                return ESP_OK;
            }

            std::string ssid_str = ssid_item->valuestring;
            std::string password_str = "";
            if (cJSON_IsString(password_item) && (password_item->valuestring != NULL) && (strlen(password_item->valuestring) < 65)) {
                password_str = password_item->valuestring;
            }

            // 获取当前对象
            auto *this_ = static_cast<WifiConfigurationAp *>(req->user_ctx);
            if (!this_->ConnectToWifi(ssid_str, password_str)) {
                cJSON_Delete(json);
                httpd_resp_send(req, "{\"success\":false,\"error\":\"Failed to connect to the Access Point\"}", HTTPD_RESP_USE_STRLEN);
                return ESP_OK;
            }

            this_->Save(ssid_str, password_str);
            save_baked_fifawatch_api_to_nvs();
            cJSON_Delete(json);
            // 设置成功响应
            httpd_resp_set_type(req, "application/json");
            httpd_resp_set_hdr(req, "Connection", "close");
            httpd_resp_send(req, "{\"success\":true}", HTTPD_RESP_USE_STRLEN);
            return ESP_OK;
        },
        .user_ctx = this
    };
    ESP_ERROR_CHECK(httpd_register_uri_handler(server_, &form_submit));

    // Register the done.html page
    httpd_uri_t done_html = {
        .uri = "/done.html",
        .method = HTTP_GET,
        .handler = [](httpd_req_t *req) -> esp_err_t {
            httpd_resp_set_hdr(req, "Connection", "close");
            httpd_resp_send(req, done_html_start, strlen(done_html_start));
            return ESP_OK;
        },
        .user_ctx = NULL
    };
    ESP_ERROR_CHECK(httpd_register_uri_handler(server_, &done_html));

    // Register the exit endpoint - exits config mode without rebooting
    httpd_uri_t exit_config = {
        .uri = "/exit",
        .method = HTTP_POST,
        .handler = [](httpd_req_t *req) -> esp_err_t {
            auto* this_ = static_cast<WifiConfigurationAp*>(req->user_ctx);
            
            // 设置响应头，防止浏览器缓存
            httpd_resp_set_type(req, "application/json");
            httpd_resp_set_hdr(req, "Cache-Control", "no-store");
            httpd_resp_set_hdr(req, "Connection", "close");
            // 发送响应
            httpd_resp_send(req, "{\"success\":true}", HTTPD_RESP_USE_STRLEN);
            
            // 延迟调用回调，确保HTTP响应完全发送
            ESP_LOGI(TAG, "Exiting config mode...");
            xTaskCreate([](void *ctx) {
                // 等待200ms确保HTTP响应完全发送
                vTaskDelay(pdMS_TO_TICKS(200));
                
                auto* self = static_cast<WifiConfigurationAp*>(ctx);
                // 通知回调退出配网模式
                if (self->on_exit_requested_) {
                    self->on_exit_requested_();
                }
                vTaskDelete(NULL);
            }, "exit_config_task", 4096, this_, 5, NULL);
            
            return ESP_OK;
        },
        .user_ctx = this
    };
    ESP_ERROR_CHECK(httpd_register_uri_handler(server_, &exit_config));

    auto captive_portal_handler = [](httpd_req_t *req) -> esp_err_t {
        auto *this_ = static_cast<WifiConfigurationAp *>(req->user_ctx);
        std::string url = this_->GetWebServerUrl() + "/?lang=" + this_->language_ + "&_=" + std::to_string(esp_timer_get_time());
        // Set content type to prevent browser warnings
        httpd_resp_set_type(req, "text/html");
        httpd_resp_set_status(req, "302 Found");
        httpd_resp_set_hdr(req, "Location", url.c_str());
        httpd_resp_set_hdr(req, "Connection", "close");
        httpd_resp_send(req, NULL, 0);
        return ESP_OK;
    };

    // Register all common captive portal detection endpoints
    const char* captive_portal_urls[] = {
        "/hotspot-detect.html",    // Apple
        "/generate_204*",           // Android
        "/mobile/status.php",      // Android
        "/check_network_status.txt", // Windows
        "/ncsi.txt",              // Windows
        "/fwlink/",               // Microsoft
        "/connectivity-check.html", // Firefox
        "/success.txt",           // Various
        "/portal.html",           // Various
        "/library/test/success.html" // Apple
    };

    for (const auto& url : captive_portal_urls) {
        httpd_uri_t redirect_uri = {
            .uri = url,
            .method = HTTP_GET,
            .handler = captive_portal_handler,
            .user_ctx = this
        };
        ESP_ERROR_CHECK(httpd_register_uri_handler(server_, &redirect_uri));
    }

    // Register the /advanced/config URI
    httpd_uri_t advanced_config = {
        .uri = "/advanced/config",
        .method = HTTP_GET,
        .handler = [](httpd_req_t *req) -> esp_err_t {
            // 获取当前对象
            auto *this_ = static_cast<WifiConfigurationAp *>(req->user_ctx);
            
            // 创建JSON对象
            cJSON *json = cJSON_CreateObject();
            if (!json) {
                httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to create JSON");
                return ESP_FAIL;
            }

            // 添加配置项到JSON
            if (!this_->ota_url_.empty()) {
                cJSON_AddStringToObject(json, "ota_url", this_->ota_url_.c_str());
            }
            cJSON_AddNumberToObject(json, "max_tx_power", this_->max_tx_power_);
            cJSON_AddBoolToObject(json, "remember_bssid", this_->remember_bssid_);
            cJSON_AddBoolToObject(json, "sleep_mode", this_->sleep_mode_);

#if CONFIG_CHRONECORE_WEATHER_CONFIG
            append_location_json(json);
#else
            cJSON_AddStringToObject(json, "weather_location", "");
            cJSON_AddItemToObject(json, "weather_cities", cJSON_CreateArray());
            cJSON_AddStringToObject(json, "location_country", "CN");
            cJSON_AddStringToObject(json, "location_city", "");
            cJSON_AddStringToObject(json, "timezone", "CST-8");
            cJSON_AddItemToObject(json, "countries", cJSON_CreateArray());
#endif

            grammarbuddy_config_append_wifi_json(json);

            // FIFAWatch API URL is baked in firmware; never expose via captive portal.

            // 发送JSON响应
            char *json_str = cJSON_PrintUnformatted(json);
            cJSON_Delete(json);
            if (!json_str) {
                httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to print JSON");
                return ESP_FAIL;
            }

            httpd_resp_set_type(req, "application/json");
            httpd_resp_set_hdr(req, "Connection", "close");
            httpd_resp_send(req, json_str, strlen(json_str));
            free(json_str);
            return ESP_OK;
        },
        .user_ctx = this
    };
    ESP_ERROR_CHECK(httpd_register_uri_handler(server_, &advanced_config));

    // Register the /advanced/submit URI
    httpd_uri_t advanced_submit = {
        .uri = "/advanced/submit",
        .method = HTTP_POST,
        .handler = [](httpd_req_t *req) -> esp_err_t {
            char *buf;
            size_t buf_len = req->content_len;
            if (buf_len > 1024) {
                httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Payload too large");
                return ESP_FAIL;
            }

            buf = (char *)malloc(buf_len + 1);
            if (!buf) {
                httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to allocate memory");
                return ESP_FAIL;
            }

            int ret = httpd_req_recv(req, buf, buf_len);
            if (ret <= 0) {
                free(buf);
                if (ret == HTTPD_SOCK_ERR_TIMEOUT) {
                    httpd_resp_send_408(req);
                } else {
                    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Failed to receive request");
                }
                return ESP_FAIL;
            }
            buf[ret] = '\0';

            // 解析JSON数据
            cJSON *json = cJSON_Parse(buf);
            free(buf);
            if (!json) {
                httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid JSON");
                return ESP_FAIL;
            }

#if CONFIG_CHRONECORE_WEATHER_CONFIG
            {
                cJSON *wl0 = cJSON_GetObjectItem(json, "weather_location");
                if (wl0 && cJSON_IsString(wl0) && wl0->valuestring) {
                    ESP_LOGI(TAG, "[city] POST /advanced/submit: weather_location='%s'", wl0->valuestring);
                } else if (wl0) {
                    ESP_LOGW(TAG, "[city] POST /advanced/submit: weather_location present but not a string");
                } else {
                    ESP_LOGW(TAG, "[city] POST /advanced/submit: JSON has NO weather_location (NVS city will NOT update)");
                }
            }
#endif

            // 获取当前对象
            auto *this_ = static_cast<WifiConfigurationAp *>(req->user_ctx);

            // 打开NVS
            nvs_handle_t nvs;
            esp_err_t err = nvs_open("wifi", NVS_READWRITE, &nvs);
            if (err != ESP_OK) {
                cJSON_Delete(json);
                httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to open NVS");
                return ESP_FAIL;
            }

            // 保存OTA URL
            cJSON *ota_url = cJSON_GetObjectItem(json, "ota_url");
            if (cJSON_IsString(ota_url) && ota_url->valuestring) {
                this_->ota_url_ = ota_url->valuestring;
                err = nvs_set_str(nvs, "ota_url", this_->ota_url_.c_str());
                if (err != ESP_OK) {
                    ESP_LOGE(TAG, "Failed to save OTA URL: %d", err);
                }
            }

            // 保存WiFi功率
            cJSON *max_tx_power = cJSON_GetObjectItem(json, "max_tx_power");
            if (cJSON_IsNumber(max_tx_power)) {
                this_->max_tx_power_ = max_tx_power->valueint;
                err = esp_wifi_set_max_tx_power(this_->max_tx_power_);
                if (err != ESP_OK) {
                    ESP_LOGE(TAG, "Failed to set WiFi power: %d", err);
                    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to set WiFi power");
                    return ESP_FAIL;
                }
                err = nvs_set_i8(nvs, "max_tx_power", this_->max_tx_power_);
                if (err != ESP_OK) {
                    ESP_LOGE(TAG, "Failed to save WiFi power: %d", err);
                }
            }

            // 保存BSSID记忆设置
            cJSON *remember_bssid = cJSON_GetObjectItem(json, "remember_bssid");
            if (cJSON_IsBool(remember_bssid)) {
                this_->remember_bssid_ = cJSON_IsTrue(remember_bssid);
                err = nvs_set_u8(nvs, "remember_bssid", this_->remember_bssid_ ? 1 : 0);
                if (err != ESP_OK) {
                    ESP_LOGE(TAG, "Failed to save remember_bssid: %d", err);
                }
            }

            // 保存睡眠模式设置
            cJSON *sleep_mode = cJSON_GetObjectItem(json, "sleep_mode");
            if (cJSON_IsBool(sleep_mode)) {
                this_->sleep_mode_ = cJSON_IsTrue(sleep_mode);
                err = nvs_set_u8(nvs, "sleep_mode", this_->sleep_mode_ ? 1 : 0);
                if (err != ESP_OK) {
                    ESP_LOGE(TAG, "Failed to save sleep_mode: %d", err);
                }
            }

            // 提交 WiFi/OTA 等（天气城市单独写入独立 NVS 命名空间 "weather"）
            err = nvs_commit(nvs);
            nvs_close(nvs);
            if (err != ESP_OK) {
                cJSON_Delete(json);
                ESP_LOGE(TAG, "[city] nvs_commit(wifi) failed: %s", esp_err_to_name(err));
                httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to save configuration");
                return ESP_FAIL;
            }

            {
                char gb_err[96] = {0};
                if (!grammarbuddy_config_save_wifi_json(json, gb_err, sizeof(gb_err))) {
                    cJSON_Delete(json);
                    char body[128];
                    snprintf(body, sizeof(body), "{\"success\":false,\"error\":\"%s\"}",
                             gb_err[0] ? gb_err : "Invalid server settings");
                    httpd_resp_set_type(req, "application/json");
                    httpd_resp_send(req, body, HTTPD_RESP_USE_STRLEN);
                    return ESP_OK;
                }
            }

#if CONFIG_CHRONECORE_WEATHER_CONFIG
            {
                char loc_err[96] = {0};
                if (!save_location_from_json(json, loc_err, sizeof(loc_err))) {
                    cJSON_Delete(json);
                    char body[128];
                    snprintf(body, sizeof(body), "{\"success\":false,\"error\":\"%s\"}",
                             loc_err[0] ? loc_err : "Invalid location");
                    httpd_resp_set_type(req, "application/json");
                    httpd_resp_send(req, body, HTTPD_RESP_USE_STRLEN);
                    return ESP_OK;
                }
            }
#endif

            save_baked_fifawatch_api_to_nvs();

            cJSON_Delete(json);

            // 发送成功响应
            httpd_resp_set_type(req, "application/json");
            httpd_resp_set_hdr(req, "Connection", "close");
            httpd_resp_send(req, "{\"success\":true}", HTTPD_RESP_USE_STRLEN);

            ESP_LOGI(TAG, "Saved settings: ota_url=%s, max_tx_power=%d, remember_bssid=%d, sleep_mode=%d",
                this_->ota_url_.c_str(), this_->max_tx_power_, this_->remember_bssid_, this_->sleep_mode_);
            return ESP_OK;
        },
        .user_ctx = this
    };
    ESP_ERROR_CHECK(httpd_register_uri_handler(server_, &advanced_submit));

    ESP_LOGI(TAG, "Web server started");
}

bool WifiConfigurationAp::ConnectToWifi(const std::string &ssid, const std::string &password)
{
    if (ssid.empty()) {
        ESP_LOGE(TAG, "SSID cannot be empty");
        return false;
    }
    
    if (ssid.length() > 32) {  // WiFi SSID 最大长度
        ESP_LOGE(TAG, "SSID too long");
        return false;
    }

    if (password.length() > 64) {
        ESP_LOGE(TAG, "Password too long");
        return false;
    }
    
    is_connecting_ = true;
    esp_wifi_scan_stop();
    xEventGroupClearBits(event_group_, WIFI_CONNECTED_BIT | WIFI_FAIL_BIT);

    wifi_config_t wifi_config;
    bzero(&wifi_config, sizeof(wifi_config));
    strlcpy((char *)wifi_config.sta.ssid, ssid.c_str(), 32);
    strlcpy((char *)wifi_config.sta.password, password.c_str(), 64);
    wifi_config.sta.scan_method = WIFI_ALL_CHANNEL_SCAN;
    wifi_config.sta.failure_retry_cnt = 1;
    
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    auto ret = esp_wifi_connect();
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to connect to WiFi: %d", ret);
        is_connecting_ = false;
        return false;
    }
    ESP_LOGI(TAG, "Connecting to WiFi %s", ssid.c_str());

    // Wait for the connection to complete for 10 or 25 seconds
    EventBits_t bits = xEventGroupWaitBits(
        event_group_,
        WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
        pdTRUE,
        pdFALSE,
#ifdef CONFIG_SOC_WIFI_SUPPORT_5G
        pdMS_TO_TICKS(25000)
#else
        pdMS_TO_TICKS(10000)
#endif
    );
    is_connecting_ = false;

    if (bits & WIFI_CONNECTED_BIT) {
        ESP_LOGI(TAG, "Connected to WiFi %s", ssid.c_str());
        esp_wifi_disconnect();
        return true;
    } else {
        ESP_LOGE(TAG, "Failed to connect to WiFi %s", ssid.c_str());
        return false;
    }
}

void WifiConfigurationAp::Save(const std::string &ssid, const std::string &password)
{
    ESP_LOGI(TAG, "Save SSID %s %d", ssid.c_str(), ssid.length());
    SsidManager::GetInstance().AddSsid(ssid, password);
}

void WifiConfigurationAp::OnExitRequested(std::function<void()> callback)
{
    on_exit_requested_ = callback;
}

void WifiConfigurationAp::WifiEventHandler(void* arg, esp_event_base_t event_base, int32_t event_id, void* event_data)
{
    WifiConfigurationAp* self = static_cast<WifiConfigurationAp*>(arg);
    if (event_id == WIFI_EVENT_AP_STACONNECTED) {
        wifi_event_ap_staconnected_t* event = (wifi_event_ap_staconnected_t*) event_data;
        ESP_LOGI(TAG, "Station " MACSTR " joined, AID=%d", MAC2STR(event->mac), event->aid);
    } else if (event_id == WIFI_EVENT_AP_STADISCONNECTED) {
        wifi_event_ap_stadisconnected_t* event = (wifi_event_ap_stadisconnected_t*) event_data;
        ESP_LOGI(TAG, "Station " MACSTR " left, AID=%d", MAC2STR(event->mac), event->aid);
    } else if (event_id == WIFI_EVENT_STA_CONNECTED) {
        xEventGroupSetBits(self->event_group_, WIFI_CONNECTED_BIT);
    } else if (event_id == WIFI_EVENT_STA_DISCONNECTED) {
        xEventGroupSetBits(self->event_group_, WIFI_FAIL_BIT);
    } else if (event_id == WIFI_EVENT_SCAN_DONE) {
        std::lock_guard<std::mutex> lock(self->mutex_);
        uint16_t ap_num = 0;
        esp_wifi_scan_get_ap_num(&ap_num);

        self->ap_records_.resize(ap_num);
        esp_wifi_scan_get_ap_records(&ap_num, self->ap_records_.data());

        // 扫描完成，等待10秒后再次扫描
        esp_timer_start_once(self->scan_timer_, 10 * 1000000);
    }
}

void WifiConfigurationAp::IpEventHandler(void* arg, esp_event_base_t event_base, int32_t event_id, void* event_data)
{
    WifiConfigurationAp* self = static_cast<WifiConfigurationAp*>(arg);
    if (event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        ESP_LOGI(TAG, "Got IP:" IPSTR, IP2STR(&event->ip_info.ip));
        xEventGroupSetBits(self->event_group_, WIFI_CONNECTED_BIT);
    }
}

#if !CONFIG_IDF_TARGET_ESP32P4
void WifiConfigurationAp::StartSmartConfig()
{
    // 注册SmartConfig事件处理器
    ESP_ERROR_CHECK(esp_event_handler_instance_register(SC_EVENT, ESP_EVENT_ANY_ID,
                                                        &WifiConfigurationAp::SmartConfigEventHandler, this, &sc_event_instance_));

    // 初始化SmartConfig配置
    smartconfig_start_config_t cfg = SMARTCONFIG_START_CONFIG_DEFAULT();
    // cfg.esp_touch_v2_enable_crypt = true;
    // cfg.esp_touch_v2_key = "1234567890123456"; // 设置16字节加密密钥

    // 启动SmartConfig服务
    ESP_ERROR_CHECK(esp_smartconfig_start(&cfg));
    ESP_LOGI(TAG, "SmartConfig started");
}

void WifiConfigurationAp::SmartConfigEventHandler(void *arg, esp_event_base_t event_base,
                                                  int32_t event_id, void *event_data)
{
    WifiConfigurationAp *self = static_cast<WifiConfigurationAp *>(arg);

    if (event_base == SC_EVENT){
        switch (event_id){
        case SC_EVENT_SCAN_DONE:
            ESP_LOGI(TAG, "SmartConfig scan done");
            break;
        case SC_EVENT_FOUND_CHANNEL:
            ESP_LOGI(TAG, "Found SmartConfig channel");
            break;
        case SC_EVENT_GOT_SSID_PSWD:{
            ESP_LOGI(TAG, "Got SmartConfig credentials");
            smartconfig_event_got_ssid_pswd_t *evt = (smartconfig_event_got_ssid_pswd_t *)event_data;

            char ssid[32], password[64];
            memcpy(ssid, evt->ssid, sizeof(evt->ssid));
            memcpy(password, evt->password, sizeof(evt->password));
            ESP_LOGI(TAG, "SmartConfig SSID: %s, Password: %s", ssid, password);
            // 尝试连接WiFi会失败，故不连接
            self->Save(ssid, password);
            // 延迟退出配网模式
            xTaskCreate([](void *ctx){
                ESP_LOGI(TAG, "Exiting config mode in 1 second");
                vTaskDelay(pdMS_TO_TICKS(1000));
                auto* self = static_cast<WifiConfigurationAp*>(ctx);
                if (self->on_exit_requested_) {
                    self->on_exit_requested_();
                }
                vTaskDelete(NULL);
            }, "exit_config_task", 4096, self, 5, NULL);
            break;
        }
        case SC_EVENT_SEND_ACK_DONE:
            ESP_LOGI(TAG, "SmartConfig ACK sent");
            esp_smartconfig_stop();
            break;
        }
    }
}
#endif // !CONFIG_IDF_TARGET_ESP32P4

void WifiConfigurationAp::Stop() {
#if !CONFIG_IDF_TARGET_ESP32P4
    // 停止SmartConfig服务
    if (sc_event_instance_) {
        esp_event_handler_instance_unregister(SC_EVENT, ESP_EVENT_ANY_ID, sc_event_instance_);
        sc_event_instance_ = nullptr;
    }
    esp_smartconfig_stop();
#endif

    // 停止定时器
    if (scan_timer_) {
        esp_timer_stop(scan_timer_);
        esp_timer_delete(scan_timer_);
        scan_timer_ = nullptr;
    }

    // 停止Web服务器
    if (server_) {
        httpd_stop(server_);
        server_ = nullptr;
    }

    // 停止DNS服务器
    if (dns_server_) {
        dns_server_->Stop();
        dns_server_.reset();
    }

    // 注销事件处理器
    if (instance_any_id_) {
        esp_event_handler_instance_unregister(WIFI_EVENT, ESP_EVENT_ANY_ID, instance_any_id_);
        instance_any_id_ = nullptr;
    }
    if (instance_got_ip_) {
        esp_event_handler_instance_unregister(IP_EVENT, IP_EVENT_STA_GOT_IP, instance_got_ip_);
        instance_got_ip_ = nullptr;
    }

    // 停止WiFi（但不 deinit，WiFi 驱动由 WifiManager 管理）
    esp_wifi_stop();
    
    // 销毁网络接口
    if (ap_netif_) {
        esp_netif_destroy_default_wifi(ap_netif_);
        ap_netif_ = nullptr;
    }

    ESP_LOGI(TAG, "Wifi configuration AP stopped");
}
