/*
 * GrammarBuddy teaching app for M5Stack StopWatch.
 */
#pragma once

#include <apps/common/key_manager/key_manager.h>
#include <memory>
#include <mooncake.h>
#include <string>

namespace grammarbuddy {
class WsClient;
}

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
    void handle_ws_message(const std::string& json);

    std::unique_ptr<input::KeyManager> _key_manager;
    std::unique_ptr<grammarbuddy::WsClient> _ws;
    std::unique_ptr<grammarbuddy::view::HomeView> _view;
    char _ws_url[192] = {};
    bool _opened      = false;
    bool _session_sent = false;
};
