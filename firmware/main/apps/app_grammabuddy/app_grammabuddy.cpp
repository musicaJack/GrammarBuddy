#include "app_grammabuddy.h"

#include "model/nvs_config.h"
#include "model/tts_player.h"
#include "model/ws_client.h"
#include "view/home_view.h"

#include <apps/app_chrone_core/model/wifi_service.h>
#include <hal/hal.h>
#include <mooncake_log.h>
#include <smooth_lvgl.hpp>

#include <cstring>

static const std::string_view _tag = "GrammarBuddy";

namespace {

bool json_copy_string(const std::string& json, const char* key, char* out, size_t out_size)
{
    if (out == nullptr || out_size == 0) {
        return false;
    }
    const std::string needle = std::string("\"") + key + "\":\"";
    const auto pos           = json.find(needle);
    if (pos == std::string::npos) {
        return false;
    }
    const size_t start = pos + needle.size();
    const auto end     = json.find('"', start);
    if (end == std::string::npos) {
        return false;
    }
    const size_t len = std::min(end - start, out_size - 1);
    json.copy(out, len, start);
    out[len] = '\0';
    return true;
}

}  // namespace

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
    _opened          = false;
    _session_sent    = false;
    _awaiting_listen = false;
    _session_id[0]   = '\0';
    _last_ws_state   = grammarbuddy::WsConnectionState::Idle;
    _key_manager     = std::make_unique<input::KeyManager>();

    {
        std::lock_guard<std::mutex> lock(_msg_mutex);
        _msg_queue.clear();
    }
    {
        std::lock_guard<std::mutex> lock(_tts_mutex);
        _tts_urls.clear();
    }

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

    _view->set_status("Connecting...", _ws_url);
    _view->set_hint("BtnA retry | A+B home");
    _opened = true;

    _ws->set_message_callback([this](const std::string& json) {
        if (json.find("\"type\":\"tts\"") != std::string::npos ||
            json.find("\"type\": \"tts\"") != std::string::npos) {
            char url[512] = {};
            if (json_copy_string(json, "url", url, sizeof(url))) {
                std::lock_guard<std::mutex> lock(_tts_mutex);
                if (_tts_urls.size() < 4) {
                    _tts_urls.emplace_back(url);
                }
            }
            return;
        }
        enqueue_ws_message(json);
    });
    start_ws_if_needed();
}

void AppGrammarBuddy::enqueue_ws_message(const std::string& json)
{
    std::lock_guard<std::mutex> lock(_msg_mutex);
    if (_msg_queue.size() < 12) {
        _msg_queue.push_back(json);
    }
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
            _view->set_status("Session starting...", "Present Simple");
        }
    }
}

void AppGrammarBuddy::send_start_listening()
{
    if (_ws == nullptr || _session_id[0] == '\0') {
        return;
    }
    char payload[160];
    std::snprintf(payload,
                  sizeof(payload),
                  "{\"type\":\"control\",\"session_id\":\"%s\",\"payload\":{\"action\":\"start_listening\"}}",
                  _session_id);
    if (_ws->send_json(payload)) {
        _awaiting_listen = false;
        LvglLockGuard lock;
        if (_view) {
            _view->set_status("Listening...", "Speak after the beep");
            _view->set_hint("A+B home");
        }
        mclog::tagInfo(_tag, "sent start_listening");
    }
}

void AppGrammarBuddy::on_ws_disconnected()
{
    _session_sent    = false;
    _awaiting_listen = false;
    _session_id[0]   = '\0';
    LvglLockGuard lock;
    if (_view) {
        _view->set_status("WS disconnected", "BtnA to retry");
        _view->set_hint("A+B home");
    }
}

void AppGrammarBuddy::process_ws_message(const std::string& json)
{
    mclog::tagInfo(_tag, "rx: {}", json.size() > 120 ? json.substr(0, 120) + "..." : json);

    if (!_view) {
        return;
    }

    if (json.find("\"type\":\"error\"") != std::string::npos ||
        json.find("\"type\": \"error\"") != std::string::npos) {
        char msg[96] = "Server error";
        json_copy_string(json, "message", msg, sizeof(msg));
        _view->set_status("Error", msg);
        _view->set_hint("BtnA retry | A+B home");
        return;
    }

    if (json.find("session_started") != std::string::npos) {
        json_copy_string(json, "session_id", _session_id, sizeof(_session_id));
        char lesson[64] = "Grammar";
        if (!json_copy_string(json, "display_name_en", lesson, sizeof(lesson))) {
            json_copy_string(json, "id", lesson, sizeof(lesson));
        }
        _awaiting_listen = false;
        _view->set_status("Ready!", lesson);
        _view->set_hint("Wait for question...");
        return;
    }

    if (json.find("\"action\":\"ask_question\"") != std::string::npos ||
        json.find("\"action\": \"ask_question\"") != std::string::npos) {
        char question[192] = {};
        if (json_copy_string(json, "current_question", question, sizeof(question))) {
            _view->set_status("Question", question);
        } else {
            _view->set_status("Question", "...");
        }
        _view->set_hint("Wait...");
        return;
    }

    if (json.find("\"action\":\"phase_complete\"") != std::string::npos) {
        if (json.find("\"next\":\"listen\"") != std::string::npos ||
            json.find("\"next\": \"listen\"") != std::string::npos) {
            _awaiting_listen = true;
            _view->set_hint("BtnA: start listening");
        } else if (json.find("\"next\":\"continue\"") != std::string::npos) {
            _view->set_hint("BtnA: continue");
        }
        return;
    }

    if (json.find("\"action\":\"ui_state\"") != std::string::npos) {
        if (json.find("\"listening\"") != std::string::npos) {
            _view->set_status("Listening...", "Say your answer");
            _awaiting_listen = false;
        } else if (json.find("\"feedback\"") != std::string::npos) {
            _view->set_status("Feedback", "Check the screen");
            _view->set_hint("BtnA: continue");
        }
        return;
    }

    if (json.find("\"type\":\"gpt\"") != std::string::npos) {
        char sentence[160] = {};
        if (json_copy_string(json, "corrected_sentence", sentence, sizeof(sentence))) {
            _view->set_status("Feedback", sentence);
        }
        return;
    }
}

void AppGrammarBuddy::process_tts_queue()
{
    std::deque<std::string> batch;
    {
        std::lock_guard<std::mutex> lock(_tts_mutex);
        batch.swap(_tts_urls);
    }
    if (batch.empty()) {
        return;
    }

    for (const auto& url : batch) {
        if (grammarbuddy::play_tts_url(url.c_str())) {
            LvglLockGuard lock;
            if (_view) {
                _view->set_hint("Playing audio...");
            }
        }
    }
}

void AppGrammarBuddy::process_pending_messages()
{
    std::deque<std::string> batch;
    {
        std::lock_guard<std::mutex> lock(_msg_mutex);
        batch.swap(_msg_queue);
    }
    if (batch.empty()) {
        return;
    }

    LvglLockGuard lock;
    for (const auto& json : batch) {
        process_ws_message(json);
    }
}

void AppGrammarBuddy::onRunning()
{
    if (!_opened) {
        return;
    }

    if (_ws) {
        const auto st = _ws->state();
        if (st != _last_ws_state) {
            if (_last_ws_state == grammarbuddy::WsConnectionState::Connected &&
                st != grammarbuddy::WsConnectionState::Connected) {
                on_ws_disconnected();
            }
            _last_ws_state = st;
        }
    }

    process_pending_messages();
    process_tts_queue();

    if (_key_manager) {
        const auto event = _key_manager->update();
        if (event == input::KeyEvent::GoHome) {
            close();
            return;
        }
        if (event == input::KeyEvent::GoPrevious) {
            if (_awaiting_listen && _ws &&
                _ws->state() == grammarbuddy::WsConnectionState::Connected) {
                send_start_listening();
            } else if (_ws && _ws->state() == grammarbuddy::WsConnectionState::Connected &&
                       !_session_sent) {
                send_start_session();
            } else if (_ws) {
                _session_sent = false;
                LvglLockGuard lock;
                if (_view) {
                    _view->set_status("Connecting...", _ws_url);
                }
                start_ws_if_needed();
            }
        }
    }

    if (_ws) {
        _ws->poll();
        if (_ws->state() == grammarbuddy::WsConnectionState::Connected && !_session_sent) {
            send_start_session();
        } else if (_ws->state() == grammarbuddy::WsConnectionState::Error && _view) {
            LvglLockGuard lock;
            _view->set_status("WS failed", _ws->last_error().c_str());
            _view->set_hint("BtnA retry | A+B home");
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
    _opened          = false;
    _session_sent    = false;
    _awaiting_listen = false;
    _session_id[0]   = '\0';
}
