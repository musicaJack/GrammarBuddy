/*
 * GrammarBuddy teaching app for M5Stack StopWatch.
 */
#pragma once

#include "model/ws_client.h"
#include <apps/common/key_manager/key_manager.h>
#include <deque>
#include <memory>
#include <mooncake.h>
#include <mutex>
#include <string>

namespace grammarbuddy::view {
class HomeView;
}

class AppGrammarBuddy : public mooncake::AppAbility {
public:
    AppGrammarBuddy();
    ~AppGrammarBuddy() override;

    void onCreate() override;
    void onOpen() override;
    void onRunning() override;
    void onClose() override;

private:
    void start_ws_if_needed();
    void send_start_session();
    void send_start_listening();
    void enqueue_ws_message(const std::string& json);
    void process_pending_messages();
    void process_tts_queue();
    void process_ws_message(const std::string& json);
    void on_ws_disconnected();

    std::unique_ptr<input::KeyManager> _key_manager;
    std::unique_ptr<grammarbuddy::WsClient> _ws;
    std::unique_ptr<grammarbuddy::view::HomeView> _view;
    char _ws_url[192]     = {};
    char _session_id[40]  = {};
    bool _opened          = false;
    bool _session_sent    = false;
    bool _awaiting_listen = false;
    grammarbuddy::WsConnectionState _last_ws_state{};

    std::mutex _msg_mutex;
    std::deque<std::string> _msg_queue;
    std::mutex _tts_mutex;
    std::deque<std::string> _tts_urls;
};
