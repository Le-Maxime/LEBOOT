# SPDX-License-Identifier: GPL-2.0

ifeq ($(CONFIG_WEBUI_FAILSAFE_UI_GL),y)
obj-y += fsdata_gl/
else ifeq ($(CONFIG_WEBUI_FAILSAFE_UI_MTK),y)
obj-y += fsdata_mtk/
else ifeq ($(CONFIG_WEBUI_FAILSAFE_UI_LEBOOT),y)
obj-y += fsdata_leboot/
else
obj-y += fsdata/
endif
