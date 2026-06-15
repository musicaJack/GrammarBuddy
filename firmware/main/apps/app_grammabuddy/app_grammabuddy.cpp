#include "app_grammabuddy.h"

#include "model/nvs_config.h"
#include "model/ws_client.h"
#include "view/home_view.h"

#include <apps/app_chrone_core/model/wifi_service.h>
#include <hal/hal.h>
#include <mooncake_log.h>
#include <smooth_lvgl.hpp>

#include <cstring>

static const std::string_view _tag = "GrammarBuddy";

AppGrammarBuddy::AppGrammarBuddy()
{
    setAppInfo().name = "Grammar";
}

AppGrammarBuddy::~AppGrammarBuddy() = default;

void AppGrammarBuddy::onCreate()
{
    mclog::tagInfo(_tag, "onCreate");
    _ws = std::make_unique<grammarbuddy::WsClient>();
}

void AppGrammarBuddy::onOpen()
{
    mclog::tagInfo(_tag, "onOpen");
    _opened        = false;
    _session_sent  = false;
    _key_manager   = std::make_unique<input::KeyManager>();

    if (!grammarbuddy::load_ws_url(_ws_url, sizeof(_ws_url))) {
        std::strncpy(_ws_url, grammarbuddy::kDefaultWsUrl, sizeof(_ws_url) - 1);
    }

    LvglLockGuard lock;
    _view = std::make_unique<grammarbuddy::view::HomeView>();
    _view->init(lv_screen_active());

    if (!chrone_core::GetWifiService().isConnected()) {
        _view->set_status("No WiFi", "Use Settings to connect");
        _view->set_hint("A+B return to Launcher");
        _opened = true;
        return;
    }

    _view->set_status("Connecting…", _ws_url);
    _opened = true;

    _ws->set_message_callback([this](const std::string& json) { handle_ws_message(json); });
    start_ws_if_needed();
}

void AppGrammarBuddy::start_ws_if_needed()
{
    if (_ws == nullptr) {
        return;
    }
    if (_ws->state() == grammarbuddy::WsConnectionState::Connected ||
        _ws->state() == grammarbuddy::WsConnectionState::Connecting) {
        return;
    }
    if (!_ws->connect(_ws_url)) {
        LvglLockGuard lock;
        if (_view) {
            _view->set_status("WS failed", _ws->last_error().c_str());
        }
        return;
    }
}

void AppGrammarBuddy::send_start_session()
{
    if (_ws == nullptr || _session_sent) {
        return;
    }
    static const char kPayload[] =
        "{\"type\":\"control\",\"payload\":{\"action\":\"start_session\",\"activity_type\":\"grammar\","
        "\"grade\":3,\"lesson_id\":\"present_simple\",\"client_type\":\"stopwatch\","
        "\"client_version\":\"0.1.0\",\"protocol_version\":\"1.0.0\"}}";
    if (_ws->send_json(kPayload)) {
        _session_sent = true;
        LvglLockGuard lock;
        if (_view) {
            _view->set_status("Session starting…", "Present Simple");
        }
    }
}

void AppGrammarBuddy::handle_ws_message(const std::string& json)
{
    mclog::tagInfo(_tag, "rx: %s", json.c_str());

    LvglLockGuard lock;
    if (!_view) {
        return;
    }

    if (json.find("session_started") != std::string::npos) {
        _view->set_status("Ready!", "Tap BtnA on HOME");
        _view->set_hint("BtnA start · B next theme");
        return;
    }
    if (json.find("\"type\":\"error\"") != std::string::npos) {
        _view->set_status("Server error", "Check ws_url / backend");
    }
}

void AppGrammarBuddy::onRunning()
{
    if (!_opened) {
        return;
    }

    if (_key_manager) {
        const auto event = _key_manager->update();
        if (event == input::KeyEvent::GoHome) {
            close();
            return;
        }
        if (event == input::KeyEvent::GoPrevious &&
            _ws && _ws->state() == grammarbuddy::WsConnectionState::Connected) {
            send_start_session();
        }
    }

    if (_ws) {
        _ws->poll();
        if (_ws->state() == grammarbuddy::WsConnectionState::Connected && !_session_sent) {
            send_start_session();
        }
    }
}

void AppGrammarBuddy::onClose()
{
    mclog::tagInfo(_tag, "onClose");
    _key_manager.reset();
    if (_ws) {
        _ws->disconnect();
    }
    LvglLockGuard lock;
    if (_view) {
        _view->destroy();
        _view.reset();
    }
    _opened       = false;
    _session_sent = false;
}
