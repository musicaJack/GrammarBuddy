message("GrammarBuddy esp_wifi_connect overlay")

if(${IDF_VER} STRGREATER_EQUAL "v6.0")
    set(_WIFI_REQUIRES esp_timer esp_http_server esp_wifi nvs_flash chrone_weather grammarbuddy_config)
else()
    set(_WIFI_REQUIRES esp_timer esp_http_server esp_wifi nvs_flash json chrone_weather grammarbuddy_config)
endif()

idf_component_register(
    SRCS
        "wifi_manager.cc"
        "wifi_configuration_ap.cc"
        "wifi_station.cc"
        "ssid_manager.cc"
        "dns_server.cc"
    INCLUDE_DIRS
        "include"
    EMBED_TXTFILES
        "assets/wifi_configuration.html"
        "assets/wifi_configuration_done.html"
    REQUIRES
        ${_WIFI_REQUIRES}
)
