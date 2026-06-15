#include "ws_client.h"

#include <esp_websocket_client.h>
#include <mooncake_log.h>

#include <cstring>

namespace grammarbuddy {

static const std::string_view _tag = "GB-WS";

static void on_ws_event(void* handler_args, esp_event_base_t /*base*/, int32_t event_id, void* event_data)
{
    auto* self = static_cast<WsClient*>(handler_args);
    if (self != nullptr) {
        self->on_transport_event(event_id, event_data);
    }
}

void WsClient::on_transport_event(int32_t event_id, void* event_data)
{
    auto* data = static_cast<esp_websocket_event_data_t*>(event_data);

    switch (event_id) {
        case WEBSOCKET_EVENT_CONNECTED:
            set_state(WsConnectionState::Connected);
            mclog::tagInfo(_tag, "connected");
            break;
        case WEBSOCKET_EVENT_DISCONNECTED:
            set_state(WsConnectionState::Idle);
            mclog::tagInfo(_tag, "disconnected");
            break;
        case WEBSOCKET_EVENT_ERROR:
            set_state(WsConnectionState::Error, "websocket error");
            mclog::tagError(_tag, "error");
            break;
        case WEBSOCKET_EVENT_DATA:
            if (data != nullptr && data->op_code == WS_TRANSPORT_OPCODES_TEXT && data->data_len > 0 &&
                _on_message) {
                _on_message(std::string(data->data_ptr, data->data_len));
            }
            break;
        default:
            break;
    }
}

WsClient::WsClient() = default;

WsClient::~WsClient()
{
    disconnect();
}

void WsClient::set_message_callback(WsMessageCallback callback)
{
    _on_message = std::move(callback);
}

bool WsClient::connect(const char* ws_url)
{
    if (ws_url == nullptr || std::strlen(ws_url) < 8) {
        set_state(WsConnectionState::Error, "invalid ws url");
        return false;
    }

    disconnect();
    set_state(WsConnectionState::Connecting);

    esp_websocket_client_config_t cfg = {};
    cfg.uri                         = ws_url;
    cfg.reconnect_timeout_ms        = 5000;
    cfg.network_timeout_ms          = 8000;

    _client = esp_websocket_client_init(&cfg);
    if (_client == nullptr) {
        set_state(WsConnectionState::Error, "init failed");
        return false;
    }

    esp_websocket_register_events(
        static_cast<esp_websocket_client_handle_t>(_client), WEBSOCKET_EVENT_ANY, on_ws_event, this);

    esp_err_t err = esp_websocket_client_start(static_cast<esp_websocket_client_handle_t>(_client));
    if (err != ESP_OK) {
        set_state(WsConnectionState::Error, "start failed");
        esp_websocket_client_destroy(static_cast<esp_websocket_client_handle_t>(_client));
        _client = nullptr;
        return false;
    }

    return true;
}

void WsClient::disconnect()
{
    if (_client == nullptr) {
        set_state(WsConnectionState::Idle);
        return;
    }

    auto* handle = static_cast<esp_websocket_client_handle_t>(_client);
    esp_websocket_client_stop(handle);
    esp_websocket_client_destroy(handle);
    _client    = nullptr;
    _connected = false;
    set_state(WsConnectionState::Idle);
}

void WsClient::poll()
{
}

bool WsClient::send_json(const char* json)
{
    if (_client == nullptr || json == nullptr || _state != WsConnectionState::Connected) {
        return false;
    }
    int sent = esp_websocket_client_send_text(
        static_cast<esp_websocket_client_handle_t>(_client), json, std::strlen(json), pdMS_TO_TICKS(3000));
    return sent >= 0;
}

void WsClient::set_state(WsConnectionState state, const char* error)
{
    _state     = state;
    _connected = state == WsConnectionState::Connected;
    if (error != nullptr) {
        _last_error = error;
    } else if (state == WsConnectionState::Connected) {
        _last_error.clear();
    }
}

}  // namespace grammarbuddy
