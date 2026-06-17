#include "tts_player.h"

#include <esp_http_client.h>
#include <hal/hal.h>
#include <mooncake_log.h>

#include <algorithm>
#include <cstdint>
#include <cstring>
#include <vector>

namespace grammarbuddy {

static const std::string_view _tag = "GB-TTS";

namespace {

uint16_t read_u16_le(const uint8_t* p)
{
    return static_cast<uint16_t>(p[0] | (p[1] << 8));
}

uint32_t read_u32_le(const uint8_t* p)
{
    return static_cast<uint32_t>(p[0] | (p[1] << 8) | (p[2] << 16) | (p[3] << 24));
}

bool parse_wav_pcm(const uint8_t* bytes, size_t len, std::vector<int16_t>& out, int& sample_rate)
{
    if (len < 44 || std::memcmp(bytes, "RIFF", 4) != 0 || std::memcmp(bytes + 8, "WAVE", 4) != 0) {
        return false;
    }

    uint16_t channels   = 0;
    uint16_t bits       = 0;
    const uint8_t* data = nullptr;
    size_t data_len     = 0;

    size_t offset = 12;
    while (offset + 8 <= len) {
        char chunk_id[5] = {};
        std::memcpy(chunk_id, bytes + offset, 4);
        const uint32_t chunk_len = read_u32_le(bytes + offset + 4);
        const size_t chunk_data  = offset + 8;

        if (std::strcmp(chunk_id, "fmt ") == 0 && chunk_len >= 16 && chunk_data + 16 <= len) {
            channels    = read_u16_le(bytes + chunk_data + 2);
            sample_rate = static_cast<int>(read_u32_le(bytes + chunk_data + 4));
            bits        = read_u16_le(bytes + chunk_data + 14);
        } else if (std::strcmp(chunk_id, "data") == 0 && chunk_data + chunk_len <= len) {
            data     = bytes + chunk_data;
            data_len = chunk_len;
        }

        offset = chunk_data + chunk_len + (chunk_len & 1);
    }

    if (data == nullptr || data_len < 2 || channels == 0 || bits != 16 || sample_rate <= 0) {
        return false;
    }

    const size_t frame_size   = static_cast<size_t>(channels) * 2;
    const size_t frame_count  = data_len / frame_size;
    out.resize(frame_count);
    for (size_t i = 0; i < frame_count; ++i) {
        out[i] = static_cast<int16_t>(data[i * frame_size] | (data[i * frame_size + 1] << 8));
    }
    return true;
}

std::vector<int16_t> resample_pcm(const std::vector<int16_t>& in, int in_rate, int out_rate)
{
    if (in.empty() || in_rate <= 0 || out_rate <= 0 || in_rate == out_rate) {
        return in;
    }

    const size_t out_len = static_cast<size_t>(static_cast<int64_t>(in.size()) * out_rate / in_rate);
    std::vector<int16_t> out(out_len);
    for (size_t i = 0; i < out_len; ++i) {
        const float src_pos = static_cast<float>(i) * static_cast<float>(in_rate) / static_cast<float>(out_rate);
        const size_t idx    = static_cast<size_t>(src_pos);
        const float frac    = src_pos - static_cast<float>(idx);
        const int16_t a     = in[std::min(idx, in.size() - 1)];
        const int16_t b     = in[std::min(idx + 1, in.size() - 1)];
        out[i]              = static_cast<int16_t>(a + frac * static_cast<float>(b - a));
    }
    return out;
}

bool http_download(const char* url, std::vector<uint8_t>& out)
{
    if (url == nullptr || url[0] == '\0') {
        return false;
    }

    esp_http_client_config_t cfg = {};
    cfg.url         = url;
    cfg.timeout_ms  = 20000;
    cfg.buffer_size = 4096;

    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (client == nullptr) {
        return false;
    }

    esp_err_t err = esp_http_client_open(client, 0);
    if (err != ESP_OK) {
        esp_http_client_cleanup(client);
        return false;
    }

    const int content_length = esp_http_client_fetch_headers(client);
    out.clear();

    if (content_length > 0) {
        out.resize(static_cast<size_t>(content_length));
        size_t total = 0;
        while (total < out.size()) {
            const int read = esp_http_client_read(
                client,
                reinterpret_cast<char*>(out.data() + total),
                static_cast<int>(out.size() - total));
            if (read <= 0) {
                break;
            }
            total += static_cast<size_t>(read);
        }
        out.resize(total);
    } else {
        uint8_t chunk[4096];
        while (true) {
            const int read = esp_http_client_read(client, reinterpret_cast<char*>(chunk), sizeof(chunk));
            if (read <= 0) {
                break;
            }
            out.insert(out.end(), chunk, chunk + read);
        }
    }

    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return !out.empty();
}

}  // namespace

bool play_tts_url(const char* url)
{
    if (url == nullptr || url[0] == '\0') {
        return false;
    }

    if (GetHAL().getSpeakerVolume() <= 0) {
        mclog::tagWarn(_tag, "speaker volume is 0");
        return false;
    }

    std::vector<uint8_t> wav_bytes;
    if (!http_download(url, wav_bytes)) {
        mclog::tagError(_tag, "download failed");
        return false;
    }

    std::vector<int16_t> pcm;
    int wav_rate = 0;
    if (!parse_wav_pcm(wav_bytes.data(), wav_bytes.size(), pcm, wav_rate)) {
        mclog::tagError(_tag, "wav parse failed ({} bytes)", wav_bytes.size());
        return false;
    }

    const int device_rate = GetHAL().getAudioSampleRate();
    if (wav_rate != device_rate) {
        pcm = resample_pcm(pcm, wav_rate, device_rate);
    }

    if (pcm.empty()) {
        return false;
    }

    mclog::tagInfo(_tag, "playing {} samples @ {} Hz", pcm.size(), device_rate);
    GetHAL().audioPlay(pcm, true);
    return true;
}

}  // namespace grammarbuddy
