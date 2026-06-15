#pragma once

#include <lvgl.h>

namespace grammarbuddy::view {

class HomeView {
public:
    void init(lv_obj_t* parent);
    void destroy();
    void set_status(const char* line1, const char* line2 = nullptr);
    void set_hint(const char* hint);

private:
    lv_obj_t* _root       = nullptr;
    lv_obj_t* _title      = nullptr;
    lv_obj_t* _status     = nullptr;
    lv_obj_t* _sub_status = nullptr;
    lv_obj_t* _hint       = nullptr;
};

}  // namespace grammarbuddy::view
