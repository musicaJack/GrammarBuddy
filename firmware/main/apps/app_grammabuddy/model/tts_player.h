#pragma once

#include <string>

namespace grammarbuddy {

/** Download WAV from OSS URL and play through the speaker. */
bool play_tts_url(const char* url);

}  // namespace grammarbuddy
