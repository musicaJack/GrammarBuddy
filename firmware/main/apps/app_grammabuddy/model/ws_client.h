#pragma once

#include <functional>
#include <string>

namespace grammarbuddy {

enum class WsConnectionState {
    Idle,
    Connecting,
    Connected,
    Error,
};

using WsMessageCallback = std::function<void(const std::string& json)>;

class WsClient {
public:
    WsClient();
    ~WsClient();

    WsClient(const WsClient&)            = delete;
    WsClient& operator=(const WsClient&) = delete;

    void set_message_callback(WsMessageCallback callback);
    bool connect(const char* ws_url);
    void disconnect();
    void poll();
    bool send_json(const char* json);

    WsConnectionState state() const
    {
        return _state;
    }
    const std::string& last_error() const
    {
        return _last_error;
    }

    void on_transport_event(int32_t event_id, void* event_data);

private:
    void set_state(WsConnectionState state, const char* error = nullptr);

    WsMessageCallback _on_message;
    WsConnectionState _state = WsConnectionState::Idle;
    std::string _last_error;
    std::string _rx_buffer;
    void* _client             = nullptr;
    bool _connected           = false;
};

}  // namespace grammarbuddy
