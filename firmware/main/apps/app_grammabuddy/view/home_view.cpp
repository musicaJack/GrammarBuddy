#include "home_view.h"

#include <cstring>

namespace grammarbuddy::view {

void HomeView::init(lv_obj_t* parent)
{
    _root = lv_obj_create(parent);
    lv_obj_remove_style_all(_root);
    lv_obj_set_size(_root, LV_PCT(100), LV_PCT(100));
    lv_obj_set_style_bg_color(_root, lv_color_hex(0x0B0F14), 0);
    lv_obj_set_style_bg_opa(_root, LV_OPA_COVER, 0);
    lv_obj_set_flex_flow(_root, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(_root, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_row(_root, 12, 0);

    _title = lv_label_create(_root);
    lv_label_set_text(_title, "Let's Learn!");
    lv_obj_set_style_text_color(_title, lv_color_hex(0xFFFFFF), 0);
    lv_obj_set_style_text_font(_title, &lv_font_montserrat_28, 0);

    _status = lv_label_create(_root);
    lv_label_set_text(_status, "Connecting…");
    lv_obj_set_style_text_color(_status, lv_color_hex(0x0A84FF), 0);
    lv_obj_set_style_text_align(_status, LV_TEXT_ALIGN_CENTER, 0);

    _sub_status = lv_label_create(_root);
    lv_label_set_text(_sub_status, "");
    lv_obj_set_style_text_color(_sub_status, lv_color_hex(0xAAB2C0), 0);
    lv_obj_set_style_text_align(_sub_status, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_width(_sub_status, LV_PCT(85));
    lv_label_set_long_mode(_sub_status, LV_LABEL_LONG_WRAP);

    _hint = lv_label_create(_root);
    lv_label_set_text(_hint, "BtnA start · A+B home");
    lv_obj_set_style_text_color(_hint, lv_color_hex(0xAAB2C0), 0);
    lv_obj_set_style_text_font(_hint, &lv_font_montserrat_14, 0);
}

void HomeView::destroy()
{
    if (_root != nullptr) {
        lv_obj_delete(_root);
        _root = _title = _status = _sub_status = _hint = nullptr;
    }
}

void HomeView::set_status(const char* line1, const char* line2)
{
    if (_status != nullptr && line1 != nullptr) {
        lv_label_set_text(_status, line1);
    }
    if (_sub_status != nullptr) {
        lv_label_set_text(_sub_status, line2 != nullptr ? line2 : "");
    }
}

void HomeView::set_hint(const char* hint)
{
    if (_hint != nullptr && hint != nullptr) {
        lv_label_set_text(_hint, hint);
    }
}

}  // namespace grammarbuddy::view
